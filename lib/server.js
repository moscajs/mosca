"use strict";

var mqtt = require("mqtt");
var async = require("async");
var ascoltatori = require("ascoltatori");
var EventEmitter = require("events").EventEmitter;
var debug = require("debug")("mosca");

/**
 * The Mosca Server is a very simple MQTT server that supports
 * only QoS 0.
 * It is backed by Ascoltatori, and it descends from
 * EventEmitter.
 *
 * Options:
 *  - `port`, the port where to create the server.
 *  - `backend`, all the options for creating the Ascoltatore
 *    that will power this server.
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

  callback = callback || function () {};

  this.clients = {};

  var that = this;

  var serveWrap = function (client) {
    that.serve(client);
  };

  if (this.opts.backend.json === undefined) {
    this.opts.backend.json = false;
  }

  this.ascoltatore = ascoltatori.build(this.opts.backend);

  async.series([
    function (cb) {
      that.ascoltatore.on("ready", cb);
    },
    function (cb) {
      that.server = mqtt.createServer(serveWrap);

      that.once("ready", callback);

      that.server.listen(that.opts.port, cb);
    }, function(cb) {
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
  if(callback) {
    process.nextTick(callback);
  }
}

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
    that.once("closed", callback);
    try {
      that.server.close(function() {
        debug("closed");
        that.emit("closed");
      });
    } catch(exception) {
      callback(exception);
    }
  });
};

/**
 * Serves a client coming from MQTT.
 *
 * @api private
 * @param {Object} client The MQTT client
 */
Server.prototype.serve = function (client) {

  var that = this;

  var setUpTimer = function() {
    if(client.timer) {
      clearTimeout(client.timer);
    }

    var timeout = client.keepalive * 1000 * 5/4;

    debug("setting keepalive timeout to " + timeout + "ms for client " + client.id);

    client.timer = setTimeout(function() {
      debug("keepalive timemout for " + client.id);
      that.closeConn(client);
    }, timeout);
  };

  client.subscriptions = {};

  client.nextId = Math.floor(65535 * Math.random());
  client.inflight = {};

  var actualSend = function (packet, retry) {
    if (retry === 3) {
      debug("Could not deliver the message with id " + packet.messageId + " to client " + client.id);
      client.emit("error", new Error("client not responding to acks"));
      return;
    }
    retry++;

    debug("sending packet with id " + packet.messageId + " for the " + retry + " time");

    if (client.stream.writable) {
      client.publish(packet);
    } else {
      client.emit("error", new Error("Client closed"));
    }

    if (packet.qos === 1) {
      debug("setting up resend timer for id " + packet.messageId);
      client.inflight[packet.messageId] = setTimeout(function () {
        actualSend(packet, retry);
      }, 1000); // one second timeout, TODO make this a parameter
    }
  };

  var forward = function (topic, payload, retry) {
    debug("delivering message on " + topic + " to " + client.id);

    var qos = client.subscriptions[topic];
    var packet = { topic: topic, payload: payload, qos: qos, messageId: client.nextId++ };

    actualSend(packet, 0);
  };

  client.on("connect", function(packet) {
    client.id = packet.clientId;
    client.keepalive = packet.keepalive;

    that.clients[client.id] = client;

    debug("client connected " + client.id);

    setUpTimer();
    client.connack({ returnCode: 0 });
    that.emit("clientConnected", client);
  });

  client.on("puback", function (packet) {
    debug("received puback for message " + packet.messageId);
    clearTimeout(client.inflight[packet.messageId]);
    delete client.inflight[packet.messageId];
  });

  client.on("pingreq", function() {
    debug("pingreq from " + client.id);
    setUpTimer();
    client.pingresp();
  });

  client.on("subscribe", function(packet) {
    var granted = packet.subscriptions.map(function (e) {
      if (e.qos === 2) {
        e.qos = 1;
      }
      return e.qos;
    });

    var subs = packet.subscriptions.filter(function (s) {
      return !client.subscriptions[s.topic];
    });

    async.parallel(subs.map(function(s) {
      return function(cb) {
        that.ascoltatore.subscribe(s.topic.replace("#", "*"), forward, function() {
          debug("subscribed " + client.id + " to " + s.topic);
          client.subscriptions[s.topic] = s.qos;
          cb();
        });
      };
    }), function() {
      client.suback({ messageId: packet.messageId, granted: granted });
    });
  });

  client.on("publish", function(packet) {
    that.ascoltatore.publish(packet.topic, packet.payload, function () {
      debug("client " + client.id + " published packet to topic " + packet.topic);
  
      if (packet.qos === 1) {
        client.puback({ messageId: packet.messageId });
      }

      that.emit("published", packet, client);
    });
  });

  var unsubscribeMapTo = function(topic) {
    return function(cb) {
      that.ascoltatore.unsubscribe(topic.replace("#", "*"), forward, function() {
        debug("unsubscribed " + client.id + " from " + topic);
        delete client.subscriptions[topic];
        cb();
      });
    };
  };

  client.on("unsubscribe", function(packet) {
    async.parallel(packet.unsubscriptions.map(unsubscribeMapTo), function() {
      client.unsuback({ messageId: packet.messageId });
    });
  });

  var unsubAndClose = function () {
    async.parallel(Object.keys(client.subscriptions).map(unsubscribeMapTo), function() {
      that.closeConn(client);
    });
  };

  client.on("disconnect", function() {
    debug("disconnected client " + client.id);
    unsubAndClose();
  });

  client.on("error", function(err) {
    debug("error for client " + client.id);
    debug(err);
    unsubAndClose();
  });
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

  if(client.id) {
    debug("closing client " + client.id);

    clearTimeout(client.timer);
    delete this.clients[client.id];
  }

  Object.keys(client.inflight, function (id) {
    clearTimeout(client.inflight[id]);
    delete client.inflight[id];
  });

  client.stream.on("end", function () {
    client.removeAllListeners();
    next(callback);
    that.emit("clientDisconnected", client);
  });
  client.stream.end();
}
