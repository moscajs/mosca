/*
Copyright (c) 2013-2014 Matteo Collina, http://matteocollina.com

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
var Stats = require("./stats");
var shortid = require("shortid");
var st = require("st");
var url = require("url");
var persistence = require('./persistence');
var defaults = {
  port: 1883,
  host: null,
  backend: {
    json: false,
    wildcardOne: '+',
    wildcardSome: '#'
  },
  stats: true,
  publishNewClient: true,
  maxInflightMessages: 1024,
  logger: {
    name: "mosca",
    level: 40,
    serializers: {
      client: clientSerializer,
      packet: packetSerializer,
      req: bunyan.stdSerializers.req,
      res: bunyan.stdSerializers.res
    }
  }
};
var nop = function() {};

/**
 * The Mosca Server is a very simple MQTT server that
 * provides a simple event-based API to craft your own MQTT logic
 * It supports QoS 0 & 1, without external storage.
 * It is backed by Ascoltatori, and it descends from
 * EventEmitter.
 *
 * Options:
 *  - `port`, the port where to create the server.
 *  - `host`, the IP address of the server (see http://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback).
 *  - `backend`, all the options for creating the Ascoltatore
 *    that will power this server.
 *  - `ascoltatore`, the ascoltatore to use (instead of `backend`).
 *  - `maxInflightMessages`, the maximum number of inflight messages per client.
 *  - `logger`, the options for Bunyan.
 *  - `logger.childOf`, the parent Bunyan logger.
 *  - `persistence`, the options for the persistence.
 *     A sub-key `factory` is used to specify what persistence
 *     to use.
 *  - `secure`, an object that includes three properties:
 *     - `port`, the port that will be used to open the secure server
 *     - `keyPath`, the path to the key
 *     - `certPath`, the path to the certificate
 *  - `allowNonSecure`, starts both the secure and the unsecure sevrver.
 *  - `http`, an object that includes the properties:
 *     - `port`, the port that will be used to open the http server
 *     - `bundle`, serve the bundled mqtt client
 *     - `static`, serve a directory
 *  - `stats`, publish the stats every 10s (default false).
 *  - `publishNewClient`, publish message to topic "$SYS/{broker-id}/new/clients" when new client connects.
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
 *  - `subscribed`, when a client is subscribed to a topic;
 *    the topic and the client are passed as parameters.
 *  - `unsubscribed`, when a client is unsubscribed to a topic;
 *    the topic and the client are passed as parameters.
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

  callback = callback || function() {};

  var persistenceFactory = this.opts.persistence && this.opts.persistence.factory;
  if (persistenceFactory) {
    if (typeof persistenceFactory === 'string') {
      var factoryName = persistenceFactory;
      persistenceFactory = persistence.getFactory(factoryName);
      if (!persistenceFactory) {
        return callback(new Error('No persistence factory found for ' + factoryName ));
      }
    }

    persistenceFactory(this.opts.persistence).wire(this);
  }

  this._dedupId = 0;
  this.clients = {};
  this.closed = false;

  if (this.opts.logger.childOf) {
    this.logger = this.opts.logger.childOf;
    delete this.opts.logger.childOf;
    delete this.opts.logger.name;
    this.logger = this.logger.child(this.opts.logger);
  } else {
    this.logger = bunyan.createLogger(this.opts.logger);
  }

  if(this.opts.stats) {
    new Stats().wire(this);
  }

  var that = this;

  var serveWrap = function(connection) {
    // disable Nagle algorithm
    connection.stream.setNoDelay(true);
    new Client(connection, that);
  };

  // each Server has a dummy id for logging purposes
  this.id = this.opts.id || shortid.generate();

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
      var func = null;
      if (that.opts.http) {
        server = http.createServer(that.buildServe(that.opts.http));
        that.attachHttpServer(server);
        that.servers.push(server);
        that.opts.http.port = that.opts.http.port || 3000;
        server.listen(that.opts.http.port, that.opts.host, cb);
      } else {
        cb();
      }
    },
    function(cb) {
      var server = null;
      if (that.opts.https) {
        server = https.createServer({
          key: fs.readFileSync(that.opts.secure.keyPath),
          cert: fs.readFileSync(that.opts.secure.certPath)
        }, that.buildServe(that.opts.https));
        that.attachHttpServer(server);
        that.servers.push(server);
        that.opts.https.port = that.opts.https.port || 3001;
        server.listen(that.opts.https.port, that.opts.host, cb);
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
        server.listen(that.opts.secure.port, that.opts.host, cb);
      } else {
        cb();
      }
    }, function(cb) {
      if ((typeof that.opts.secure === 'undefined' || that.opts.allowNonSecure) && !that.opts.onlyHttp) {
        var server = mqtt.createServer(serveWrap);
        that.servers.push(server);
        server.listen(that.opts.port, that.opts.host, cb);
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
    if(that.opts.publishNewClient) {
      that.publish({
        topic: "$SYS/" + that.id + "/new/clients",
        payload: client.id
      });
    }

    this.clients[client.id] = client;
  });

  that.ascoltatore.subscribe(
    "$SYS/+/new/clients",
    function(topic, payload) {
      var serverId, clientId;

      serverId = topic.split('/')[1];
      clientId = payload;

      if(that.clients[clientId] && serverId !== that.id) {
        that.clients[clientId].close();
      }
    }
  );

  that.on("subscribed", function(topic, client) {
    that.publish({
      topic: "$SYS/" + that.id + "/new/subscribes",
      payload: client.id
    });
  });

  that.on("clientDisconnected", function(client) {
    delete this.clients[client.id];
  });
}

module.exports = Server;

Server.prototype = Object.create(EventEmitter.prototype);

Server.prototype.toString = function() {
  return 'mosca.Server';
};

/**
 * Publishes a packet on the MQTT broker.
 *
 * @api public
 * @param {Object} packet The MQTT packet, it should include the
 *                        topic, payload, qos, and retain keys.
 * @param {Object} client The client object (internal)
 * @param {String} password The password
 */
Server.prototype.publish = function publish(packet, client, callback) {

  var that = this;
  var logger = this.logger;

  if (typeof client === 'function') {
    callback = client;
    client = null;
  } else if (client) {
    logger = client.logger;
  }

  if (!callback) {
    callback = nop;
  }

  var newPacket = {
    topic: packet.topic,
    payload: packet.payload,
    messageId: this.generateUniqueId(),
    qos: packet.qos,
    retain: packet.retain
  };

  var options = {
    qos: packet.qos,
    messageId: newPacket.messageId
  };

  if (client) {
    options.clientId = client.id;
  }

  that.storePacket(newPacket, function() {
    if (that.closed) {
      logger.debug({ packet: packet }, "not delivering because we are closed");
      return;
    }

    that.ascoltatore.publish(
      packet.topic,
      packet.payload,
      options,
      function() {
        that.published(packet, client, function() {
          logger.debug({ packet: packet }, "published packet");
          that.emit("published", packet, client);
          callback();
        });
      }
    );
  });
};

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
 * The function that will be used to authorize forwarding packet to client.
 * This default implementation authorize any packet for any client.
 * Override at will
 *
 * @api public
 * @param {Object} client The MQTTConnection that is a client.
 * @param {Object} packet The packet to be published.
 * @param {Function} callback The callback to return the authorization flag.
 */
Server.prototype.authorizeForward = function(client, packet, callback) {
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
 * Delete a packet for the offline storage
 * This is a NOP, override at will.
 *
 * @api public
 * @param {Object} client The client
 * @param {Number} messageId The messsageId of the packet
 * @param {Function} callback
 */
Server.prototype.deleteOfflinePacket = function(client, messageId, callback) {
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
 * Updates an offline packet.
 * This is a NOP, override at will.
 *
 * @param {MoscaClient} client
 * @param {Integer} originMessageId The original message id
 * @param {Object} packet The new packet
 * @param {Function} callback
 */
Server.prototype.updateOfflinePacket = function(client, originMessageId, packet, callback) {
  if (callback) {
    callback(null, packet);
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

  callback = callback || function nop() {};

  if (that.closed) {
    return callback();
  }

  that.closed = true;

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
      callback();
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
 * Create the serve logic for an http server.
 * 
 * @api public
 * @param {Object} opts The same options of the constructor's
 *                      options, http or https.
 */
Server.prototype.buildServe = function(opts) {
  var mounts = [];
  var logger = this.logger.child({ service: 'http bundle' });

  if (opts.bundle) {
    mounts.push(st({
      path: __dirname + "/../public",
      url: "/",
      dot: true,
      index: false,
      passthrough: true
    }));
  }

  if (opts.static) {
    mounts.push(st({
      path: opts.static,
      dot: true,
      url: "/",
      index: "index.html",
      passthrough: true
    }));
  }

  return function serve(req, res) {

    logger.info({ req: req });

    var cmounts = [].concat(mounts);

    res.on('finish', function() {
      logger.info({ res: res });
    });

    function handle() {
      var mount = cmounts.shift();

      if (mount) {
        mount(req, res, handle);
      } else {
        res.statusCode = 404;
        res.end("Not Found\n");
      }
    }

    handle();
  };
};

Server.prototype.nextDedupId = function() {
  return this._dedupId++;
};

Server.prototype.generateUniqueId = function() {
  return shortid.generate();
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
