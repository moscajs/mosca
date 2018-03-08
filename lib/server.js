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

var Connection = require("mqtt-connection");
var ws = require("websocket-stream");
var steed = require("steed")();
var ascoltatori = require("ascoltatori");
var EventEmitter = require("events").EventEmitter;
var pino = require("pino");
var extend = require("extend");
var Client = require("./client");
var Stats = require("./stats");
var nanoid = require("nanoid");
var persistence = require('./persistence');
var options = require('./options');
var interfaces = require('./interfaces');

var defaults = options.defaultsLegacy();
var nop = function() {};

/**
 * The Mosca Server is a very simple MQTT server that
 * provides a simple event-based API to craft your own MQTT logic
 * It supports QoS 0 & 1, without external storage.
 * It is backed by Ascoltatori, and it descends from
 * EventEmitter.
 *
 * Options:
 *  - `host`, the IP address of the server (see http://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback).
 *  - `interfaces`, list of network interfaces with necessary options.
 *  - `backend`, all the options for creating the Ascoltatore
 *    that will power this server.
 *  - `ascoltatore`, the ascoltatore to use (instead of `backend`).
 *  - `maxInflightMessages`, the maximum number of inflight messages per client.
 *  - `logger`, the options for Pino.
 *  - `persistence`, the options for the persistence.
 *     A sub-key `factory` is used to specify what persistence
 *     to use.
 *  - `credentials`, credentials for secure connection, includes two properties:
 *     - `keyPath`, the path to the key
 *     - `certPath`, the path to the certificate
 *     - `*`, additional properties are passed as options to `tls.createServer` (see https://nodejs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener)
 *  - `stats`, publish the stats every 10s (default false).
 *  - `publishNewClient`, publish message to topic "$SYS/{broker-id}/new/clients" when new client connects.
 *  - `publishClientDisconnect`, publish message to topic "$SYS/{broker-id}/disconnect/clients" when a client disconnects.
 *  - `publishSubscriptions`, publish message to topic "$SYS/{broker-id}/new/(un)subscribes" when a client subscribes/unsubscribes.
 *
 * Interface may contain following properties:
 *  - `type`, name of a build-in type or a custom type factory
 *  - `port`, target port, overrides default port infered from `type`
 *  - `host`, target host, overrides
 *
 * Built-in interface types:
 *  - `mqtt`, normal mqtt, port: 1883
 *  - `mqtts`, mqtt over ssl, port: 8883, requires `credentials`
 *  - `http`, mqtt over websocket, port: 3000
 *  - `https`, mqtt over secure websocket, port: 3001, requires `credentials`
 *
 * Events:
 *  - `clientConnected`, when a client is connected;
 *    the client is passed as a parameter.
 *  - `clientDisconnecting`, when a client is being disconnected;
 *    the client is passed as a parameter.
 *  - `clientDisconnected`, when a client is disconnected;
 *    the client is passed as a parameter.
 *  - `clientError`, when the server identifies a client connection error;
 *    the error and the client are passed as parameters.
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
  var modernOpts = options.modernize(opts);
  var validationResult = options.validate(modernOpts);

  if (validationResult.errors.length > 0) {
    var errMessage = validationResult.errors[0].message;
    if (callback) {
      callback(new Error(errMessage));
    } else {
      throw new Error(errMessage);
    }
  }

  modernOpts = options.populate(modernOpts);

  if (!(this instanceof Server)) {
    return new Server(opts, callback);
  }

  EventEmitter.call(this);

  if (true) { // REFACTOR: kludge for tests that rely on options structure
    this.opts = extend(true, {}, defaults, opts);
    this.modernOpts = modernOpts;

    if (this.opts.secure) {
      this.opts.secure.port = this.opts.secure.port || 8883;
    }
    if (this.opts.http) {
      this.opts.http.port = this.opts.http.port || 3000;
    }
    if (this.opts.https) {
      this.opts.https.port = this.opts.https.port || 3001;
    }
  } else { // REFACTOR: enable this once test are updated
    this.opts = modernOpts;
  }

  callback = callback || function() {};

  this._dedupId = 0;
  this.clients = {};
  this.closed = false;

  if (this.modernOpts.logger.childOf) {
    this.logger = this.modernOpts.logger.childOf;
    delete this.modernOpts.logger.childOf;
    delete this.modernOpts.logger.name;
    this.logger = this.logger.child(this.modernOpts.logger);
  } else {
    this.logger = pino(this.modernOpts.logger);
  }

  if(this.modernOpts.stats) {
    new Stats().wire(this);
  }

  var that = this;

  // put QOS-2 spoofing as a variable direct on server
  this.onQoS2publish = this.modernOpts.onQoS2publish;
  
  // each Server has a dummy id for logging purposes
  this.id = this.modernOpts.id || nanoid(7);

  // initialize servers list
  this.servers = [];


  steed.series([

    // steed.series: wait for ascoltatore
    function (done) {

      if(that.modernOpts.ascoltatore) {
        that.ascoltatore = that.modernOpts.ascoltatore;
        done();
      }
      else {
        that.ascoltatore = ascoltatori.build(that.modernOpts.backend, done);
        that.ascoltatore.on('error', that.emit.bind(that, 'error'));
      }
    },

    // steed.series: wait for persistence

    function (done) {
      // REFACTOR: partially move to options.validate and options.populate?
      var persistenceFactory = that.modernOpts.persistence && that.modernOpts.persistence.factory;
      if (persistenceFactory) {
        if (typeof persistenceFactory === 'string') {
          var factoryName = persistenceFactory;
          persistenceFactory = persistence.getFactory(factoryName);
          if (!persistenceFactory) {
            return callback(new Error('No persistence factory found for ' + factoryName ));
          }
        }

        that.persistence = persistenceFactory(that.modernOpts.persistence, done);
        that.persistence.wire(that);
      } else {
        that.persistence = null;
        done();
      }
    },

    // steed.series: iterate over defined interfaces, build servers and listen
    function (done) {

      steed.eachSeries(that.modernOpts.interfaces, function (iface, dn) {
        var fallback = that.modernOpts;
        var host = iface.host || that.modernOpts.host;
        var port = iface.port || that.modernOpts.port;

        var server = interfaces.serverFactory(iface, fallback, that);
        that.servers.push(server);
        server.maxConnections = iface.maxConnections || 10000000;
        
        // Catch listen errors
        server.on('error', function (e) {
          that.logger.error('Error starting Mosca Server');
          that.emit('error', e);
        });        
        server.listen(port, host, dn);
      }, done);
    },

    // steed.series: log startup information
    function (done) {
      var logInfo = {};

      that.modernOpts.interfaces.forEach(function (iface) {
        var name = iface.type;
        if (typeof name !== "string") {
          name = iface.type.name;
        }
        logInfo[name] = iface.port;
      });

      that.logger.info(logInfo, "server started");
      that.emit("ready");
      done(null);
    }
  ], function(err, results){
    if(err) {
      callback(err);
    }
  });

  that.on("clientConnected", function(client) {
    if(that.modernOpts.publishNewClient) {
      that.publish({
        topic: "$SYS/" + that.id + "/new/clients",
        payload: client.id
      });
    }

    this.clients[client.id] = client;
  });

  that.once("ready", function() {
    callback(null, that);
  });

  that.on('ready', function() {
    that.ascoltatore.subscribe(
      "$SYS/+/new/clients",
      function(topic, payload) {
        var serverId, clientId;

        serverId = topic.split('/')[1];
        clientId = payload;

        if(that.clients[clientId] && serverId !== that.id) {
          that.clients[clientId].close(null, "new connection request");
        }
      }
    );
  });

  if(that.modernOpts.publishSubscriptions) {
    that.on("subscribed", function(topic, client) {
      that.publish({
        topic: "$SYS/" + that.id + "/new/subscribes",
        payload: JSON.stringify({
          clientId: client.id,
          topic: topic
        })
      });
    });

    that.on("unsubscribed", function(topic, client) {
      that.publish({
        topic: "$SYS/" + that.id + "/new/unsubscribes",
        payload: JSON.stringify({
          clientId: client.id,
          topic: topic
        })
      });
    });
  }

  that.on("clientDisconnected", function(client) {
    if(that.modernOpts.publishClientDisconnect) {
      that.publish({
        topic: "$SYS/" + that.id + "/disconnect/clients",
        payload: client.id
      });
    }
    delete this.clients[client.id];
  });
}

module.exports = Server;

Server.prototype = Object.create(EventEmitter.prototype);

Server.prototype.toString = function() {
  return 'mosca.Server';
};

/**
 * Subscribes to a topic on the MQTT broker.
 *
 * @api public
 * @param {String} topic The MQTT topic
 * @param {Function} callback The callback with (topic, payload) arguments
 * @param {Function} done The subscription result
 */
Server.prototype.subscribe = function subscribe(topic, callback, done) {
  this.ascoltatore.subscribe(topic, callback, done);
};

/**
 * Publishes a packet on the MQTT broker.
 *
 * @api public
 * @param {Object} packet The MQTT packet, it should include the
 *                        topic, payload, qos, and retain keys.
 * @param {Object} client The client object (internal)
 * @param {Function} callback The callback
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

  var opts = {
    qos: packet.qos,
    messageId: newPacket.messageId
  };

  if (client) {
    opts.clientId = client.id;
  }

  that.storePacket(newPacket, function() {
    if (that.closed) {
      logger.debug({ packet: newPacket }, "not delivering because we are closed");
      return;
    }

    that.ascoltatore.publish(
      newPacket.topic,
      newPacket.payload,
      opts,
      function() {
        that.published(newPacket, client, function() {
          if( newPacket.topic.indexOf( '$SYS' ) >= 0 ) {
            logger.trace({ packet: newPacket }, "published packet");
          } else {
            logger.debug({ packet: newPacket }, "published packet");
          }
          that.emit("published", newPacket, client);
          callback(undefined, newPacket);
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
 * The function that is called after receiving a publish message but before
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

  if (that.persistence) {
    stuffToClose.push(that.persistence);
  }

  steed.each(stuffToClose, function(toClose, cb) {
    toClose.close(cb, "server closed");
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
 * @param {String} path
 */
Server.prototype.attachHttpServer = function(server, path) {
  var that = this;

  var opt = { server: server };
  if (path) {
    opt.path = path;
  }
  
  ws.createServer(opt, function(stream) {
    var conn = new Connection(stream);
    new Client(conn, that);
  });
};

Server.prototype.nextDedupId = function() {
  return this._dedupId++;
};

Server.prototype.generateUniqueId = function() {
  return nanoid(7);
};
