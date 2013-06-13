"use strict";

var mqtt = require("mqtt");
var async = require("async");
var ascoltatori = require("ascoltatori");
var EventEmitter = require("events").EventEmitter;
var bunyan = require("bunyan");
var debug = require("debug")("mosca");

/**
 * The Mosca Server is a very simple MQTT server that
 * provides a simple event-based API to craft your own MQTT logic
 * It supports QoS 0 & 1, without external storage.
 * It is backed by Ascoltatori, and it descends from
 * EventEmitter.
 *
 * Options:
 *  - `port`, the port where to create the server.
 *  - `backend`, all the options for creating the Ascoltatore
 *    that will power this server.
 *  - `baseRetryTimeout`, the retry timeout for the exponential
 *    backoff algorithm (default is 1s).
 *
 * Events:
 *  - `clientConnected`, when a client is connected;
 *    the client is passed as a parameter.
 *  - `clientDisconnected`, when a client is disconnected;
 *    the client is passed as a parameter.
 *  - `published`, when a new message is published;
 *    the packet and the client are passed as parameters.
 *
 * @param {Object} opts The option object
 * @param {Function} callback The ready callback
 * @api public
 */
function Server(opts, callback) {
  EventEmitter.call(this);

  this.opts = opts || {};
  this.opts.port = this.opts.port || 1883;
  this.opts.backend = this.opts.backend || {};
  this.opts.baseRetryTimeout = this.opts.baseRetryTimeout || 1000;
  this.opts.logger = this.opts.logger || {};
  this.opts.logger.name = this.opts.logger.name || "mosca";
  this.opts.logger.level = this.opts.logger.level || 40;


  callback = callback || function() {};

  this.clients = {};
  this.logger = bunyan.createLogger(this.opts.logger);

  var that = this;

  var serveWrap = function(client) {
    process.nextTick(function() {
      // disable Nagle algorithm
      client.stream.setNoDelay(true);
      that.serve(client);
    });
  };

  if (this.opts.backend.json === undefined) {
    this.opts.backend.json = false;
  }

  this.ascoltatore = ascoltatori.build(this.opts.backend);
  this.ascoltatore.on("error", this.emit.bind(this));

  that.once("ready", callback);

  async.series([
    function(cb) {
      that.ascoltatore.on("ready", cb);
    },
    function(cb) {
      that.server = mqtt.createServer(serveWrap);
      that.server.listen(that.opts.port, cb);
    }, function(cb) {
      that.server.maxConnections = 100000;
      that.emit("ready");
      debug("started on port " + that.opts.port);
    }
  ]);
}

module.exports = Server;

Server.prototype = Object.create(EventEmitter.prototype);

/**
 * Utility function to call a callback in the next tick
 * if it was there.
 *
 * @api private
 * @param {Function} callback
 */
function next(callback) {
  if (callback) {
    process.nextTick(callback);
  }
}

/**
 * The function that will be used to authenticate users.
 * This default implementation authenticate everybody.
 * Override at will.
 *
 * @api public
 * @param {Object} client The MQTTConnection that is a client
 * @param {String} username The username
 * @param {String} password The password
 * @param {Function} callback The callback to return the verdict
 */
Server.prototype.authenticate = function(client, username, password, callback) {
  callback(null, true);
};

/**
 * The function that will be used to authorize clients to publish to topics.
 * This default implementation authorize everybody.
 * Override at will
 *
 * @api public
 * @param {Object} client The MQTTConnection that is a client
 * @param {String} topic The topic
 * @param {String} paylod The paylod
 * @param {Function} callback The callback to return the verdict
 */
Server.prototype.authorizePublish = function(client, topic, payload, callback) {
  callback(null, true);
};

/**
 * The function that will be used to authorize clients to subscribe to topics.
 * This default implementation authorize everybody.
 * Override at will
 *
 * @api public
 * @param {Object} client The MQTTConnection that is a client
 * @param {String} topic The topic
 * @param {Function} callback The callback to return the verdict
 */
Server.prototype.authorizeSubscribe = function(client, topic, callback) {
  callback(null, true);
};

/**
 * Closes the server.
 *
 * @api public
 * @param {Function} callback The closed callback function
 */
Server.prototype.close = function(callback) {
  var that = this;

  callback = callback || function() {};

  async.parallel(Object.keys(that.clients).map(function(id) {
    return function(cb) {
      that.closeConn(that.clients[id], cb);
    };
  }), function() {
    that.ascoltatore.close(function () {
      that.once("closed", callback);
      try {
        that.server.close(function() {
          debug("closed");
          that.emit("closed");
        });
      } catch (exception) {
        callback(exception);
      }
    });
  });
};

/**
 * Serves a client coming from MQTT.
 *
 * @api private
 * @param {Object} client The MQTT client
 */
Server.prototype.serve = function(client) {

  var that = this;

  var setUpTimer = function() {
    if (client.timer) {
      clearTimeout(client.timer);
    }

    var timeout = client.keepalive * 1000 * 5 / 4;

    debug("setting keepalive timeout to " + timeout + "ms for client " + client.id);

    client.timer = setTimeout(function() {
      debug("keepalive timemout for " + client.id);
      that.closeConn(client);
    }, timeout);
  };

  client.subscriptions = {};

  client.nextId = Math.floor(65535 * Math.random());
  client.inflight = {};

  var actualSend = function(packet, retry) {
    if (retry === 10) {
      debug("Could not deliver the message with id " + packet.messageId + " to client " + client.id);
      client.emit("error", new Error("client not responding to acks"));
      return;
    }

    debug("sending packet to " + packet.topic + " with id " + packet.messageId + " for the " + retry + " time");

    client.publish(packet);

    if (packet.qos === 1) {
      debug("setting up resend timer for id " + packet.messageId);
      client.inflight[packet.messageId] = setTimeout(function() {
        retry++;
        actualSend(packet, retry);

        // exponential backoff algorithm
      }, that.opts.baseRetryTimeout * Math.pow(2, retry));
    }
  };

  var forward = function(topic, payload, options, sub_topic, initial_qos) {
    debug("delivering message on " + topic + " to " + client.id);

    var pub_qos = options && options.qos,
        sub = client.subscriptions[sub_topic],
        sub_qos = sub && sub.qos,
        qos = Math.min(pub_qos || 0,
                       (sub_qos === undefined ? initial_qos : sub_qos) || 0);

    var packet = {
      topic: topic,
      payload: payload,
      qos: qos,
      messageId: client.nextId++
    };

    actualSend(packet, 0);
  };

  var unsubscribeMapTo = function(topic) {
    return function(cb) {
      var sub = client.subscriptions[topic],
          handler = (sub && sub.handler) || forward;
      that.ascoltatore.unsubscribe(topic.replace("#", "*"), handler, function(err) {
        if (err) {
          cb(err);
          return;
        }
        debug("unsubscribed " + client.id + " from " + topic);
        delete client.subscriptions[topic];
        cb();
      });
    };
  };

  var unsubAndClose = function(cb) {
    client.removeListener("close", client._onclose);
    async.parallel(Object.keys(client.subscriptions).map(unsubscribeMapTo), function() {
      that.closeConn(client, cb);
    });
  };

  client.on("connect", function(packet) {

    client.id = packet.clientId;

    that.authenticate(client, packet.username, packet.password,
                      function(err, verdict) {
      if (err) {
        debug("The authentication errored");
        client.stream.end();
        that.emit("error", err);
        return;
      }

      if (!verdict) {
        debug("authorization to username " + packet.username + " denied");
        client.connack({
          returnCode: 5
        });
        client.stream.end();
        return;
      }

      client.keepalive = packet.keepalive;
      client.will = packet.will;

      that.clients[client.id] = client;

      debug("client connected " + client.id);

      setUpTimer();
      client.connack({
        returnCode: 0
      });
      that.emit("clientConnected", client);
    });
  });

  client.on("puback", function(packet) {
    debug("received puback for message " + packet.messageId);
    if (client.inflight[packet.messageId]) {
      clearTimeout(client.inflight[packet.messageId]);
      delete client.inflight[packet.messageId];
    } else {
      debug("no such packet");
    }
  });

  client.on("pingreq", function() {
    debug("pingreq from " + client.id);
    setUpTimer();
    client.pingresp();
  });

  client.on("subscribe", function(packet) {
    var granted = packet.subscriptions.map(function(e) {
      if (e.qos === 2) {
        e.qos = 1;
      }
      if (client.subscriptions[e.topic] !== undefined) {
        client.subscriptions[e.topic].qos = e.qos;
      }
      return e.qos;
    });

    var subs = packet.subscriptions.filter(function(s) {
      return client.subscriptions[s.topic] === undefined;
    });

    async.parallel(subs.map(function(s) {
      return function(cb) {
        that.authorizeSubscribe(client, s.topic, function(err, success) {
          if (err) {
            cb(err);
            return;
          }

          if (!success) {
            cb("not authorized");
            return;
          }

          var handler = function(topic, payload, options) {
            forward(topic, payload, options, s.topic, s.qos);
          };

          that.ascoltatore.subscribe(
            s.topic.replace("#", "*"),
            handler,
            function(err) {
              if (err) {
                cb(err);
                return;
              }
              debug("subscribed " + client.id + " to " + s.topic);
              client.subscriptions[s.topic] = { qos: s.qos, handler: handler };
              cb();
            });
        });
      };
    }), function(err) {
      if (err) {
        unsubAndClose();
        return;
      }
      client.suback({
        messageId: packet.messageId,
        granted: granted
      });
    });
  });

  client.on("publish", function(packet) {
    that.authorizePublish(client, packet.topic, packet.payload, function(err, success) {
      if (err || !success) {
        unsubAndClose();
        return;
      }

      that.ascoltatore.publish(
        packet.topic,
        packet.payload,
        {
          qos: packet.qos,
          mosca: {
            client: client, // the client object
            packet: packet  // the packet being sent
          }
        },
        function() {
          debug("client " + client.id + " published packet to topic " + packet.topic);

          if (packet.qos === 1) {
            client.puback({
              messageId: packet.messageId
            });
          }

          that.emit("published", packet, client);
        });
    });
  });

  client.on("unsubscribe", function(packet) {
    async.parallel(packet.unsubscriptions.map(unsubscribeMapTo), function(err) {
      if (err) {
        unsubAndClose();
        return;
      }
      client.unsuback({
        messageId: packet.messageId
      });
    });
  });

  client.on("disconnect", function() {
    debug("disconnected client " + client.id);
    unsubAndClose();
  });

  client.on("error", function(err) {
    debug("error for client " + client.id);
    debug(err);
    this.stream.end();
  });

  client.on("close", function() {
    this._closed = true;
  });

  client._onclose = function() {
    unsubAndClose(function() {
      if (client.will) {
        debug("delivering last will for client " + client.id + " to topic " + client.will.topic);
        that.ascoltatore.publish(
          client.will.topic,
          client.will.payload,
          { qos: client.will.qos, clientId: client.id });
      }
    });
  };

  client.on("close", client._onclose);
};

/**
 * Closes a client connection.
 *
 * @param {Object} client The client to close
 * @param {Function} callback The callback that will be called
 * when the client will be disconnected
 * @api private
 */
Server.prototype.closeConn = function(client, callback) {
  var that = this;

  if (client.id) {
    debug("closing client " + client.id);

    clearTimeout(client.timer);
    delete this.clients[client.id];
  }

  var cleanup = function() {
    // clears the inflights timeout here
    // as otherwise there might be one issued
    // after calling end()
    Object.keys(client.inflight).forEach(function(id) {
      clearTimeout(client.inflight[id]);
      delete client.inflight[id];
    });

    client.removeAllListeners();
    next(callback);
    that.emit("clientDisconnected", client);
  };

  client.removeListener("close", client._onclose);

  if (client._closed) {
    cleanup();
  } else {
    client.stream.on("end", cleanup);
    client.stream.end();
  }
};
