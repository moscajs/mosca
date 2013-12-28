"use strict";

var async  = require("async");

var REGEXP = /(([^/])\/+$)|(([^/]))|(\/+(\/))/g;
var rewriteTopic = function(topic) {
  return topic.replace(REGEXP, "$2$4$6");
};

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
  conn.setPacketEncoding('binary');

  this.server = server;
  this.logger = server.logger;
  this.subscriptions = {};

  this.nextId = 0;
  this.inflight = {};
  this._lastDedupId = -1;

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

  client.on("connect", function(packet) {
    that.handleConnect(packet);
  });

  client.on("puback", function(packet) {
    that.handlePuback(packet);
  });

  client.on("pingreq", function() {
    that.logger.debug("pingreq");
    that.setUpTimer();
    that.connection.pingresp();
  });

  client.on("subscribe", function(packet) {
    that.setUpTimer();
    that.handleSubscribe(packet);
  });

  client.on("publish", function(packet) {
    that.setUpTimer();
    packet.topic = rewriteTopic(packet.topic);
    that.server.authorizePublish(that, packet.topic, packet.payload, function(err, success) {
      that.handleAuthorizePublish(err, success, packet);
    });
  });

  client.on("unsubscribe", function(packet) {
    that.setUpTimer();
    that.logger.info({ packet: packet }, "unsubscribe received");
    async.parallel(packet.unsubscriptions.map(that.unsubscribeMapTo.bind(that)), function(err) {
      if (err) {
        that.logger.warn(err);
        that.close();
        return;
      }
      client.unsuback({
        messageId: packet.messageId
      });
    });
  });

  client.on("disconnect", function() {
    that.logger.debug("disconnect requested");
    that.close();
  });

  client.on("error", function(err) {
    that.logger.warn(err);
    that.onNonDisconnectClose();
  });

  client.on("close", function() {
    if (!that._closed || !that._closing) {
      that.onNonDisconnectClose();
    }
  });
};

/**
 * Sets up the keepalive timer.
 * To not be called directly.
 *
 * @api private
 */
Client.prototype.setUpTimer = function() {
  if (this.timer) {
    clearTimeout(this.timer);
  }
  var timeout = this.keepalive * 1000 * 5 / 4;
  var that = this;

  this.logger.debug({ timeout: timeout }, "setting keepalive timeout");

  this.timer = setTimeout(function() {
    that.logger.info("keepalive timeout");
    that.close();
  }, timeout);
};

/**
 * Sends a publish packet for real. It also handles the QoS 1 retry.
 *
 * @api private
 */
Client.prototype.actualSend = function(packet, retry) {
  var that = this;
  var timer;
  var packetToLog = { packet: packet, retry: retry };

  if (that._closed || that._closing) {
    this.logger.debug(packetToLog, "trying to send a packet to a disconnected client");
  } else if (retry === 10) {
    this.logger.debug(packetToLog, "could not deliver the message");
    this.connection.emit("error", new Error("client not responding to acks"));
  } else {

    this.logger.debug(packetToLog, "sending packet");

    this.connection.publish(packet);

    if (packet.qos === 1) {
      this.logger.debug(packetToLog, "setting up the resend timer");

      timer = setTimeout(function() {
        retry++;
        packet.dup = true;
        that.actualSend(packet, retry);

        // exponential backoff algorithm
      }, this.server.opts.baseRetryTimeout * Math.pow(2, retry));

      this.inflight[packet.messageId] = {
        packet: packet,
        timer: timer
      };
    }
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
  this.forward = function(topic, payload, options, subTopic, initialQoS, cb) {
    if (options._dedupId === undefined) {
      options._dedupId = that.server.nextDedupId();
    } else if (options._dedupId <= that._lastDedupId) {
      return;
    }
    that._lastDedupId = options._dedupId;

    that.logger.info({ topic: topic }, "delivering message");

    var pubQoS = options && options.qos,
        sub = that.subscriptions[subTopic],
        subQoS = sub && sub.qos,
        qos = Math.min(pubQoS || 0,
                       (subQoS === undefined ? initialQoS : subQoS) || 0);

    var packet = {
      topic: topic,
      payload: payload,
      qos: qos,
      messageId: this.nextId++
    };

    if (cb) {
      cb();
    }

    that.actualSend(packet, 0);
  };
};

/**
 * Builds a function for unsubscribing from a topic.
 *
 * @api private
 */
Client.prototype.unsubscribeMapTo = function(topic) {
  var that = this;
  return function(cb) {
    var sub = that.subscriptions[topic],
    handler = (sub && sub.handler) || that.forward;
    that.server.ascoltatore.unsubscribe(topic.replace(/\#/g, "*"), handler, function(err) {
      if (err) {
        cb(err);
        return;
      }
      if (!that._closing || that.clean) {
        that.logger.info({ topic: topic }, "unsubscribed");
        delete that.subscriptions[topic];
      }
      cb();
    });
  };
};

/**
 * Handle a connect packet, doing authentication.
 *
 * @api private
 */
Client.prototype.handleConnect = function(packet) {
  var that = this, logger, client = this.connection;

  this.id = packet.clientId;
  this.logger = logger = that.logger.child({ client: this });

  that.server.authenticate(this, packet.username, packet.password,
                           function(err, verdict) {

    if (err) {
      logger.info({ username: packet.username }, "authentication error");
      client.stream.end();
      that.connection.emit("error", err);
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
    if (that.will) {
      that.will.topic = rewriteTopic(that.will.topic);
    }

    that.clean = packet.clean;
    
    var completeConnection = function(){
      that.setUpTimer();
      
      that.server.restoreClientSubscriptions(that, function() {
        client.connack({
          returnCode: 0
        });

        logger.info("client connected");
        that.server.emit("clientConnected", that);
        that.server.forwardOfflinePackets(that);
      });
    };

    if (that.id in that.server.clients){
      that.server.clients[that.id].close(completeConnection);
    } else {
      completeConnection();
    }
  });
};

/**
 * Handle a puback packet.
 *
 * @api private
 */
Client.prototype.handlePuback = function(packet) {
  var logger = this.logger;

  logger.debug({ packet: packet }, "puback");
  if (this.inflight[packet.messageId]) {
    clearTimeout(this.inflight[packet.messageId].timer);
    delete this.inflight[packet.messageId];
  } else {
    logger.warn({ packet: packet }, "no such packet");
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
    cb("not authorized");
    return;
  }

  var that = this;

  var handler = function(topic, payload, options) {
    that.forward(topic, payload, options, s.topic, s.qos);
  };

  this.server.ascoltatore.subscribe(
    s.topic.replace(/\#/g, "*"),
    handler,
    function(err) {
      if (err) {
        cb(err);
        return;
      }
      that.logger.info({ topic: s.topic, qos: s.qos }, "subscribed to topic");
      that.subscriptions[s.topic] = { qos: s.qos, handler: handler };
      cb();
    }
  );
};

/**
 * Handle a subscribe packet.
 *
 * @api private
 */
Client.prototype.handleSubscribe = function(packet) {
  var that = this, server = this.server, logger = this.logger;

  logger.debug({ packet: packet }, "subscribe received");

  var granted = calculateGranted(this, packet);
  var subs = packet.subscriptions.filter(function(s) {
    s.topic = rewriteTopic(s.topic);
    return that.subscriptions[s.topic] === undefined;
  });

  async.parallel(subs.map(function(s) {
    return function(cb) {
      server.authorizeSubscribe(that, s.topic, function(err, success) {
        that.handleAuthorizeSubscribe(err, success, s, cb);
      });
    };
  }), function(err) {
    if (err) {
      that.close();
      return;
    }

    packet.subscriptions.forEach(function(sub) {
      that.server.forwardRetained(sub.topic, that);
      that.server.emit("subscribed", sub.topic, that);
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

  if (err || !success) {
    that.close();
    return;
  }

  var options = {
    qos: packet.qos,
    mosca: {
      client: this, // the client object
      packet: packet  // the packet being sent
    }
  };

  that.server.ascoltatore.publish(
    packet.topic,
    packet.payload,
    options,
    function() {
      that.logger.info({ packet: packet }, "published packet");

      that.server.storePacket(packet, function() {
        that.server.published(packet, that, function() {
          if (packet.qos === 1 && !(that._closed || that._closing)) {
            that.connection.puback({
              messageId: packet.messageId
            });
          }

          that.server.emit("published", packet, that);
        });
      });
    }
  );
};

/**
 * Stuff to do when a client closes without a disconnect.
 * it also deliver the client last will.
 *
 * @api private
 */
Client.prototype.onNonDisconnectClose = function() {
  var that = this, logger = that.logger;

  that._streamClosedRequiresCleanup = true;

  if (that.will) {
    logger.info({ willTopic: that.will.topic }, "delivering last will");
    that.server.ascoltatore.publish(
      that.will.topic,
      that.will.payload,
      { qos: that.will.qos, clientId: that.id });
  }

  this.close();
};

/**
 * Close the client
 *
 * @api public
 * @param {Function} callback The callback to be called when the Client is closed
 */
Client.prototype.close = function(callback) {

  if (this._closed || this._closing) {
    if (callback) {
      return callback();
    } else {
      return;
    }
  }

  var that = this;

  if (this.id) {
    that.logger.debug("closing client");

    clearTimeout(this.timer);
  }

  var cleanup = function() {
    that._closed = true;

    that.logger.info("closed");
    that.connection.removeAllListeners();
    // ignore all errors after disconnection
    that.connection.on("error", function() {});
    that.server.emit("clientDisconnected", that);

    // clears the inflights timeout here
    // as otherwise there might be one issued
    // after calling end()
    Object.keys(that.inflight).forEach(function(id) {
      clearTimeout(that.inflight[id]);
      delete that.inflight[id];
    });

    if (callback) {
      callback();
    }
  };

  that._closing = true;

  async.parallel(Object.keys(that.subscriptions).map(that.unsubscribeMapTo.bind(that)), function() {
    that.server.persistClient(that);
    if(that._streamClosedRequiresCleanup){
      cleanup();
    } else {
      that.connection.stream.on('end', cleanup);
      that.connection.stream.end();
    }
  });
};

module.exports = Client;
