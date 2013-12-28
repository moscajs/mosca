"use strict";

var mqtt = require("mqtt");
var mows = require("mows");
var http = require("http");
var https = require("https");
var async = require("async");
var fs    = require("fs");
var ascoltatori = require("ascoltatori");
var EventEmitter = require("events").EventEmitter;
var bunyan = require("bunyan");
var extend = require("extend");
var Client = require("./client");
var express = require("express");
var browserify = require('browserify-middleware');
var defaults = {
  port: 1883,
  backend: {
    json: false
  },
  baseRetryTimeout: 1000,
  logger: {
    name: "mosca",
    level: 40,
    serializers: {
      client: clientSerializer,
      packet: packetSerializer
    }
  }
};

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
 *  - `ascoltatore`, the ascoltatore to use (instead of `backend`).
 *  - `baseRetryTimeout`, the retry timeout for the exponential
 *    backoff algorithm (default is 1s).
 *  - `logger`, the options for Bunyan.
 *  - `logger.childOf`, the parent Bunyan logger.
 *  - `persitance`, the options for the persistence.
 *     A sub-key `factory` is used to specify what persitance
 *     to use.
 *  - `secure`, an object that includes three properties:
 *     - `port`, the port that will be used to open the secure server
 *     - `keyPath`, the path to the key
 *     - `certPath`, the path to the certificate
 *  - `allowNonSecure`, starts both the secure and the unsecure sevrver.
 *  - `http`, an object that includes the properties:
 *     - `port`, the port that will be used to open the http server
 *     - `bundle`, serve the bundled mqtt client
 *     - `static`, serve a directory through the static express
 *        middleware
 *
 * Events:
 *  - `clientConnected`, when a client is connected;
 *    the client is passed as a parameter.
 *  - `clientDisconnecting`, when a client is being disconnected;
 *    the client is passed as a parameter.
 *  - `clientDisconnected`, when a client is disconnected;
 *    the client is passed as a parameter.
 *  - `published`, when a new message is published;
 *    the packet and the client are passed as parameters.
 *  - `subscribed`, when a new client is subscribed to a pattern;
 *    the pattern and the client are passed as parameters.
 *
 * @param {Object} opts The option object
 * @param {Function} callback The ready callback
 * @api public
 */
function Server(opts, callback) {

  if (!(this instanceof Server)) {
    return new Server(opts, callback);
  }

  EventEmitter.call(this);

  this.opts = extend(true, {}, defaults, opts);

  if (this.opts.persistence && this.opts.persistence.factory) {
    this.opts.persistence.factory(this.opts.persistence).wire(this);
  }

  callback = callback || function() {};

  this._dedupId = 0;
  this.clients = {};
  
  if (this.opts.logger.childOf) {
    this.logger = this.opts.logger.childOf;
    delete this.opts.logger.childOf;
    delete this.opts.logger.name;
    this.logger = this.logger.child(this.opts.logger);
  } else {
    this.logger = bunyan.createLogger(this.opts.logger);
  }

  var that = this;

  var serveWrap = function(connection) {
    // disable Nagle algorithm
    connection.stream.setNoDelay(true);
    new Client(connection, that);
  };

  this.ascoltatore = opts.ascoltatore || ascoltatori.build(this.opts.backend);
  this.ascoltatore.on("error", this.emit.bind(this));

  // initialize servers list
  this.servers = [];

  that.once("ready", function() {
    callback(null, that);
  });

  async.series([
    function(cb) {
      that.ascoltatore.on("ready", cb);
    },
    function(cb) {
      var server = null;
      var app = express();
      if (that.opts.http) {
        server = http.createServer(app);

        if (that.opts.http.bundle) {
          that.serveBundle(app);
        }

        if (that.opts.http.static) {
          app.use(express.static(that.opts.http.static));
        }

        that.attachHttpServer(server);
        that.servers.push(server);
        that.opts.http.port = that.opts.http.port || 3000;
        server.listen(that.opts.http.port, cb);
      } else {
        cb();
      }
    },
    function(cb) {
      var server = null;
      var app = express();
      if (that.opts.https) {
        server = https.createServer({
          key: fs.readFileSync(that.opts.secure.keyPath),
          cert: fs.readFileSync(that.opts.secure.certPath)
        }, app);

        if (that.opts.https.bundle) {
          that.serveBundle(app);
        }

        if (that.opts.https.static) {
          app.use(express.static(that.opts.https.static));
        }

        that.attachHttpServer(server);
        that.servers.push(server);
        that.opts.https.port = that.opts.https.port || 3001;
        server.listen(that.opts.https.port, cb);
      } else {
        cb();
      }
    },
    function(cb) {
      var server = null;
      if (that.opts.secure && !that.opts.onlyHttp) {
        server = mqtt.createSecureServer(that.opts.secure.keyPath, that.opts.secure.certPath, serveWrap);
        that.servers.push(server);
        that.opts.secure.port = that.opts.secure.port || 8883;
        server.listen(that.opts.secure.port, cb);
      } else {
        cb();
      }
    }, function(cb) {
      if ((typeof that.opts.secure === 'undefined' || that.opts.allowNonSecure) && !that.opts.onlyHttp) {
        var server = mqtt.createServer(serveWrap);
        that.servers.push(server);
        server.listen(that.opts.port, cb);
      } else {
        cb();
      }
    }, function(cb) {
      var logInfo = { 
        port: (that.opts.onlyHttp ? undefined : that.opts.port),
        securePort: (that.opts.secure || {}).port,
        httpPort: (that.opts.http || {}).port,
        httpsPort: (that.opts.https || {}).port
      };

      that.logger.info(logInfo, "server started");

      that.servers.forEach(function(server) {
        server.maxConnections = 100000;
      });
      that.emit("ready");
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
 * The function that is called before after receiving a publish message but before
 * answering with puback for QoS 1 packet.
 * This default implementation does nothing
 * Override at will
 *
 * @api public
 * @param {Object} packet The MQTT packet
 * @param {Object} client The MQTTConnection that is a client
 * @param {Function} callback The callback to send the puback
 */
Server.prototype.published = function(packet, client, callback) {
  callback(null);
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
 * Store a packet for future usage, if needed.
 * Only packets with the retained flag are setted, or for which
 * there is an "offline" subscription".
 * This is a NOP, override at will.
 *
 * @api public
 * @param {Object} packet The MQTT packet to store
 * @param {Function} callback
 */
Server.prototype.storePacket = function(packet, callback) {
  if (callback) {
    callback();
  }
};

/**
 * Forward all the retained messages of the specified pattern to
 * the client.
 * This is a NOP, override at will.
 *
 * @api public
 * @param {String} pattern The topic pattern.
 * @param {MoscaClient} client The client to forward the packet's to.
 * @param {Function} callback
 */
Server.prototype.forwardRetained = function(pattern, client, callback) {
  if (callback) {
    callback();
  }
};

/**
 * Restores the previous subscriptions in the client 
 * This is a NOP, override at will.
 *
 * @param {MoscaClient} client
 * @param {Function} callback
 */
Server.prototype.restoreClientSubscriptions = function(client, callback) {
  if (callback) {
    callback();
  }
};

/**
 * Forward all the offline messages the client has received when it was offline.
 * This is a NOP, override at will.
 *
 * @param {MoscaClient} client
 * @param {Function} callback
 */
Server.prototype.forwardOfflinePackets = function(client, callback) {
  if (callback) {
    callback();
  }
};

/**
 * Persist a client.
 * This is a NOP, override at will.
 *
 * @param {MoscaClient} client
 * @param {Function} callback
 */
Server.prototype.persistClient = function(client, callback) {
  if (callback) {
    callback();
  }
};

/**
 * Closes the server.
 *
 * @api public
 * @param {Function} callback The closed callback function
 */
Server.prototype.close = function(callback) {
  var that = this;
  var stuffToClose = [];

  Object.keys(that.clients).forEach(function(i) {
    stuffToClose.push(that.clients[i]);
  });

  that.servers.forEach(function(server) {
    stuffToClose.push(server);
  });

  async.each(stuffToClose, function(toClose, cb) {
    toClose.close(cb);
  }, function() {
    that.ascoltatore.close(function () {
      that.logger.info("server closed");
      that.emit("closed");
      if (callback) {
        callback();
      }
    });
  });
};

/**
 * Attach a Mosca server to an existing http server
 * 
 * @api public
 * @param {HttpServer} server
 */
Server.prototype.attachHttpServer = function(server) {
  var that = this;
  mows.attachServer(server, function(conn) {
    new Client(conn, that);
  });
};

/**
 * Add the middleware for serving the bundle
 * to an Express app.
 *
 * @api public
 * @param {ExpressApp} app
 */
Server.prototype.serveBundle = function(app) {
  app.get('/mqtt.js', browserify(require.resolve('mows'), {
    standalone: 'mqtt'
  }));
};

Server.prototype.nextDedupId = function() {
  return this._dedupId++;
};

/**
 * Serializises a client for Bunyan.
 *
 * @api private
 */
function clientSerializer(client) {
  return client.id;
}

/**
 * Serializises a packet for Bunyan.
 *
 * @api private
 */
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
