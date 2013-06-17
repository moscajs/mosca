"use strict";

var mqtt = require("mqtt");
var async = require("async");
var ascoltatori = require("ascoltatori");
var EventEmitter = require("events").EventEmitter;
var bunyan = require("bunyan");
var Client = require("./client");

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
  this.opts.logger.serializers = {
    client: clientSerializer,
    packet: packetSerializer
  };

  callback = callback || function() {};

  this.clients = {};
  this.logger = bunyan.createLogger(this.opts.logger);

  var that = this;

  var serveWrap = function(connection) {
    // disable Nagle algorithm
    connection.stream.setNoDelay(true);
    new Client(connection, that);
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
      that.logger.info({ port: that.opts.port }, "server started");
    }
  ]);

  that.on("clientConnected", function(client) {
    that.clients[client.id] = client;
  });

  that.on("clientDisconnected", function(client) {
    delete that.clients[client.id];
  });
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
      that.clients[id].close(cb);
    };
  }), function() {
    that.ascoltatore.close(function () {
      that.once("closed", callback);
      try {
        that.server.close(function() {
          that.logger.info("closed");
          that.emit("closed");
        });
      } catch (exception) {
        callback(exception);
      }
    });
  });
};

function clientSerializer(client) {
  return client.id;
}

function packetSerializer(packet) {
  var result = {};

  if (packet.messageId) {
    result.messageId = packet.messageId;
  }

  if (packet.topic) {
    result.topic = packet.topic;
  }

  if (packet.qos) {
    result.qos = packet.qos;
  }

  if (packet.unsubscriptions) {
    result.unsubscriptions = packet.unsubscriptions;
  }

  if (packet.subscriptions) {
    result.subscriptions = packet.subscriptions;
  }

  return result;
}
