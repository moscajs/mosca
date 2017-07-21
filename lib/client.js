/*
Copyright (c) 2013-2016 Matteo Collina, http://matteocollina.com

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/
"use strict";

var steed = require("steed")();
var uuid = require("uuid");
var retimer = require('retimer');

function nop() {}

/**
 * The Client is just the object modelling a server representation
 * of a client
 *
 * @param {MqttConnection} conn The mqtt connection object for this client
 * @param {Server} server The Mosca server this client will be tied to
 * @api public
 */
function Client(conn, server) {
  this.connection = conn;
  this.server = server;
  this.logger = server.logger;
  this.subscriptions = {};

  this.nextId = 1;
  this.inflight = {};
  this.inflightCounter = 0;
  this._lastDedupId = -1;
  this._closed = false;
  this._closing = false;

  this._setup();
}

/**
 * Sets up all the handlers, to not be called directly.
 *
 * @api private
 */
Client.prototype._setup = function() {
  var that = this, client = that.connection;

  this._buildForward();

  client.on("error", nop);

  function completeConnection() {
    that.setUpTimer();

    that.server.restoreClientSubscriptions(that, function(session_present) {
      client.connack({
        returnCode: 0,
        // maybe session_present is null, custom old persistence engine
        // or not persistence defined
        sessionPresent: session_present ? true : false
      });

      that.logger.info("client connected");
      that.server.emit("clientConnected", that);

      // packets will be forward only if client.clean is false
      that.server.forwardOfflinePackets(that);
    });

    client.on("puback", function(packet) {
      that.setUpTimer();
      that.handlePuback(packet);
    });

    client.on("pingreq", function() {
      that.logger.debug("pingreq");
      that.setUpTimer();
      that.handlePingreq();
      that.connection.pingresp();
    });

    client.on("subscribe", function(packet) {
      that.setUpTimer();
      that.handleSubscribe(packet);
    });

    client.on("publish", function(packet) {
      that.setUpTimer();
      that.server.authorizePublish(that, packet.topic, packet.payload, function(err, success) {
        that.handleAuthorizePublish(err, success, packet);
      });
    });

    client.on("unsubscribe", function(packet) {
      that.setUpTimer();
      that.logger.info({ packet: packet }, "unsubscribe received");
      steed.map(that, packet.unsubscriptions, that.unsubscribeMapTo, function(err) {
        if (err) {
          that.logger.warn(err);
          that.close(null, err.message);
          return;
        }
        that.server.persistClient(that);
        client.unsuback({
          messageId: packet.messageId
        });
      });
    });

    client.on("disconnect", function() {
      that.logger.debug("disconnect requested");
      that.close(null, "disconnect request");
    });

    function handleError(err) {
      that.server.emit("clientError", err, that);
      that.onNonDisconnectClose(err.message);
    }

    client.on("error", handleError);
    client.removeListener("error", nop);

    client.on("close", function() {
      that.onNonDisconnectClose("close");
    });
  }

  client.once("connect", function(packet) {
    that.handleConnect(packet, completeConnection);
  });
};

/**
 * Sets up the keepalive timer.
 * To not be called directly.
 *
 * @api private
 */
Client.prototype.setUpTimer = function() {
  if (this.keepalive <= 0) {
    return;
  }

  var timeout = this.keepalive * 1000 * 3 / 2;
  var that = this;

  this.logger.debug({ timeout: timeout }, "setting keepalive timeout");

  if (this.timer) {
    this.timer.reschedule(timeout);
  } else {
    this.timer = retimer(function keepaliveTimeout() {
      that.logger.info("keepalive timeout");
      that.onNonDisconnectClose("keepalive timeout");
    }, timeout);
  }
};

/**
 * Builds the forward property for this object.
 * It wraps 'this' inside a closure.
 *
 * @api private
 */
Client.prototype._buildForward = function() {
  var that = this;

  function doForward(err, packet) {
    if (err) {
      return that.client && that.client.emit('error', err);
    }

    that.server.authorizeForward(that, packet, function(err, authorized) {
      if (err) {
        return that.client && that.client.emit('error', err);
      }

      if (!authorized) {
        that.logger.warn(packet, "Unauthorized Forward");
        return;
      }

      that.connection.publish(packet);

      if (packet.qos === 1) {
        that.inflight[packet.messageId] = packet;
      }
    });
  }

  this.forward = function(topic, payload, options, subTopic, qos, cb) {
    if (options._dedupId <= that._lastDedupId) {
      return;
    }

    that.logger.trace({ topic: topic }, "delivering message");

    var sub = that.subscriptions[subTopic],
        indexWildcard = subTopic.indexOf("#"),
        indexPlus = subTopic.indexOf("+"),
        forward = true,
        newId = this.nextId++;

    // Make sure 'nextId' always fits in a uint8 (http://git.io/vmgKI).
    this.nextId %= 65536;

    var packet = {
      topic: topic,
      payload: payload,
      qos: qos,
      messageId: newId
    };

    if (qos) {
      that.inflightCounter++;
    }

    if (that._closed || that._closing) {
      that.logger.debug({ packet: packet }, "trying to send a packet to a disconnected client");
      forward = false;
    } else if (that.inflightCounter >= that.server.opts.maxInflightMessages) {
      that.logger.warn("too many inflight packets, closing");
      that.close(null, "too many inflight packets");
      forward = false;
    }

    if (cb) {
      cb();
    }

    // skip delivery of messages in $SYS for wildcards
    forward = forward &&
              ! ( topic.indexOf('$SYS') >= 0 &&
                  (
                    indexWildcard >= 0 &&
                    indexWildcard < 2 ||
                    indexPlus >= 0 &&
                    indexPlus < 2
                  )
                );

    if (forward) {
      if (options._dedupId === undefined) {
        options._dedupId = that.server.nextDedupId();
        that._lastDedupId = options._dedupId;
      }

      if (qos && options.messageId) {
        that.server.updateOfflinePacket(that, options.messageId, packet, doForward);
      } else {
        doForward(null, packet);
      }
    }
  };
};

/**
 * Builds a function for unsubscribing from a topic.
 *
 * @api private
 */
Client.prototype.unsubscribeMapTo = function(topic, cb) {
  var that = this;
  var sub = that.subscriptions[topic];
  if (!sub || !sub.handler) {
    that.server.emit("unsubscribed", topic, that);
    return cb();
  }

  that.server.ascoltatore.unsubscribe(topic, sub.handler, function(err) {
    if (err) {
      cb(err);
      return;
    }

    if (!that._closing || that.clean) {
      delete that.subscriptions[topic];
      that.logger.info({ topic: topic }, "unsubscribed");
      that.server.emit("unsubscribed", topic, that);
    }

    cb();
  });
};

/**
 * Handle a connect packet, doing authentication.
 *
 * @api private
 */
Client.prototype.handleConnect = function(packet, completeConnection) {
  var that = this, logger, client = this.connection;

  this.id = packet.clientId;

  this.logger = logger = that.logger.child({ client: this });

  // for MQTT 3.1.1 (protocolVersion == 4) it is valid to receive an empty
  // clientId if cleanSession is set to 1. In this case, Mosca should generate
  // a random ID.
  // Otherwise, the connection should be rejected.
  if(!this.id) {

    if(packet.protocolVersion == 4 && packet.clean) {

      this.id = uuid.v4();
    }
    else {

      logger.info("identifier rejected");
      client.connack({
        returnCode: 2
      });
      client.stream.end();
      return;
    }
  }


  that.server.authenticate(this, packet.username, packet.password,
                           function(err, verdict) {

    if (err) {
      logger.info({ username: packet.username }, "authentication error");
      client.connack({
        returnCode: 4
      });
      client.stream.end();
      return;
    }

    if (!verdict) {
      logger.info({ username: packet.username }, "authentication denied");
      client.connack({
        returnCode: 5
      });
      client.stream.end();
      return;
    }

    that.keepalive = packet.keepalive;
    that.will = packet.will;

    that.clean = packet.clean;

    if (that.id in that.server.clients){
      that.server.clients[that.id].close(completeConnection, "new connection request");
    } else {
      completeConnection();
    }
  });
};

/**
 * Handle a pingreq
 *
 * @api private
 */
Client.prototype.handlePingreq = function() {
  var that = this;
  that.server.emit("pingreq", that);
};

/**
 * Handle a puback packet.
 *
 * @api private
 */
Client.prototype.handlePuback = function(packet) {
  var logger = this.logger;
  var that = this;

  logger.debug({ packet: packet }, "puback");
  if (this.inflight[packet.messageId]) {
    this.server.emit("delivered", this.inflight[packet.messageId], that);
    this.inflightCounter--;
    delete this.inflight[packet.messageId];
    this.server.deleteOfflinePacket(this, packet.messageId, function(err) {
      if (err) {
        return that.client && that.client.emit("error", err);
      }
      logger.debug({ packet: packet }, "cleaned offline packet");
    });
  } else {
    logger.info({ packet: packet }, "no matching packet");
  }
};

/**
 * Calculate the QoS of the subscriptions.
 *
 * @api private
 */
function calculateGranted(client, packet) {
  return packet.subscriptions.map(function(e) {
    if (e.qos === 2) {
      e.qos = 1;
    }
    if (client.subscriptions[e.topic] !== undefined) {
      client.subscriptions[e.topic].qos = e.qos;
    }
    return e.qos;
  });
}

/**
 * Handle the result of the Server's authorizeSubscribe method.
 *
 * @api private
 */
Client.prototype.handleAuthorizeSubscribe = function(err, success, s, cb) {
  if (err) {
    cb(err);
    return;
  }

  if (!success) {
    this.logger.info({ topic: s.topic }, "subscribe not authorized");
    cb(null, false);
    return;
  }

  var that = this;

  var handler = function(topic, payload, options) {
    that.forward(topic, payload, options, s.topic, s.qos);
  };

  if (this.subscriptions[s.topic] === undefined) {
    this.subscriptions[s.topic] = { qos: s.qos, handler: handler };
    this.server.ascoltatore.subscribe(
      s.topic,
      handler,
      function(err) {
        if (err) {
          delete that.subscriptions[s.topic];
          cb(err);
          return;
        }
        that.logger.info({ topic: s.topic, qos: s.qos }, "subscribed to topic");
        //that.subscriptions[s.topic] = { qos: s.qos, handler: handler };
        cb(null, true);
      }
    );
  } else {
    cb(null, true);
  }
};

function handleEachSub (s, cb) {
  /*jshint validthis:true */
  var that = this;
  if (this.subscriptions[s.topic] === undefined) {
    this.server.authorizeSubscribe(that, s.topic, function(err, success) {
      that.handleAuthorizeSubscribe(err, success, s, cb);
    });
  } else {
    cb(null, true);
  }
}

/**
 * Handle a subscribe packet.
 *
 * @api private
 */
Client.prototype.handleSubscribe = function(packet) {
  var that = this, server = this.server, logger = this.logger;

  logger.debug({ packet: packet }, "subscribe received");

  var granted = calculateGranted(this, packet);

  steed.map(this, packet.subscriptions, handleEachSub, function(err, authorized) {

    if (err) {
      that.close(null, err.message);
      return;
    }

    that.server.persistClient(that);

    packet.subscriptions.forEach(function(sub, index) {
      if (authorized[index]) {
        that.server.forwardRetained(sub.topic, that);
        that.server.emit("subscribed", sub.topic, that);
      } else {
        granted[index] = 0x80;
      }
    });

    if(!that._closed) {
      that.connection.suback({
        messageId: packet.messageId,
        granted: granted
      });
    }
  });
};

/**
 * Handle the result of a call to the Server's authorizePublish
 *
 * @api private
 */
Client.prototype.handleAuthorizePublish = function(err, success, packet) {
  var that = this;

  // if err is passed, or success is false or undefined, terminate the connection
  if (err || !success) {
    if (!this._closed && !this._closing) {
      that.close(null, (err && err.message) || "publish not authorized");
    }
    return;
  }

  if (success instanceof Buffer) {
    packet.payload = success;
  }

  // Mosca does not support QoS2
  // if onQoS2publish === 'dropToQoS1', don't just ignore QoS2 message, puback it
  // by converting internally to qos 1.
  // this fools mqtt.js into not holding all messages forever
  // if onQoS2publish === 'disconnect', then break the client connection if QoS2
  if (packet.qos === 2){
    switch(that.server.onQoS2publish){
      case 'dropToQoS1':
        packet.qos = 1;
        break;
      case 'disconnect':
        if (!this._closed && !this._closing) {
          that.close(null, "qos2 caused disconnect");
        }
        return;
      default:
        break;
    }
  }

  var dopuback = function() {
    if (packet.qos === 1 && !(that._closed || that._closing)) {
      that.connection.puback({
        messageId: packet.messageId
      });
    }
  };  

  // if success is passed as 'ignore', ack but don't publish.
  if (success !== 'ignore'){
    // publish message
    that.server.publish(packet, that, dopuback);
  } else {
    // ignore but acknowledge message
    dopuback();
  }

};

/**
 * Stuff to do when a client closes without a disconnect.
 * it also deliver the client last will.
 *
 * @api private
 */
Client.prototype.onNonDisconnectClose = function(reason) {
  var that = this, logger = that.logger, will = that.will;

  if (this._closed || this._closing) {
    return;
  }

  if (that.will) {
    logger.info({ packet: will }, "delivering last will");
    setImmediate(function() {
      that.server.authorizePublish(that, will.topic, will.payload, function(err, success) {
        that.handleAuthorizePublish(err, success, will);
      });
    });
  }

  this.close(null, reason);
};

/**
 * Close the client
 *
 * @api public
 * @param {Function} callback The callback to be called when the Client is closed
 */
Client.prototype.close = function(callback, reason) {

  callback = callback || nop;

  if (this._closed || this._closing) {
    return callback();
  }

  var that = this;

  if (this.id) {
    that.logger.debug("closing client, reason: " + reason);

    if (this.timer) {
      this.timer.clear();
    }
  }

  var cleanup = function() {
    that._closed = true;

    that.logger.info("closed");
    that.connection.removeAllListeners();
    // ignore all errors after disconnection
    that.connection.on("error", function() {});
    that.server.emit("clientDisconnected", that, reason);

    callback();
  };

  that._closing = true;

  steed.map(that, Object.keys(that.subscriptions), that.unsubscribeMapTo, function(err) {
    if (err) {
      that.logger.info(err);
    }

    // needed in case of errors
    if (!that._closed) {
      cleanup();
      // prefer destroy[Soon]() to prevent FIN_WAIT zombie connections
      if (that.connection.stream.destroySoon) {
        that.connection.stream.destroySoon();
      } else if (that.connection.stream.destroy) {
        that.connection.stream.destroy();
      } else {
        that.connection.stream.end();
      }
    }
  });
};

module.exports = Client;
