"use strict";

var AbstractPersistence = require("./abstract");
var redis = require("redis");
var util = require("util");
var Qlobber = require("qlobber").Qlobber;
var async = require("async");
var extend = require("extend");
var defaults = {
  channel: "moscaSync",
  ttl: {
    // TTL for subscriptions is 1 hour
    subscriptions: 60 * 60 * 1000,

    // TTL for packets is 1 hour
    packets: 60 * 60 * 1000,

    // the checkFrequency is 1 minute
    checkFrequency: 60 * 1000
  }
};

/**
 * A Redis-based persistance.
 *
 * The current options include:
 *  - `port`, the Redis' port.
 *  - `host`, the Redis' host.
 *  - `password`, the Redis' password.
 *  - `redisOpts`, the options for the Redis client.
 *  - `channel`, the pub/sub channel that will be used to synchronize
 *    the various clients. Defaults to `'moscaSync'`.
 *  - `ttl`, an object containing three values:
 *    * `subscriptions`, the time (ms) after which subscriptions
 *      will expire. It defaults to 1 hour.
 *    * `packets`, the time (ms) after which packets will expire.
 *  - all other `levelup` otions. It defaults to 1 hour.
 *
 * @api public
 * @param {Object} options The options to create this persistance
 * @param {Function} callback
 */
function RedisPersistence(options, callback) {
  if (!(this instanceof RedisPersistence)) {
    return new RedisPersistence(options, callback);
  }

  this.options = extend(true, {}, defaults, options);

  this._subLobber = new Qlobber({ separator: "/" });

  this._client = this._buildClient();
  this._pubSubClient = this._buildClient();
  this._uuid = require("node-uuid").v1();

  var newSub = function(key, cb, retried) {
    that._client.get(key, function(err, result) {
      if (err) {
        if (cb) {
          cb(err);
        } else {
          return;
        }
      }

      var id = key.split(":")[2];
      var subs = JSON.parse(result);

      if (!result || typeof subs !== 'object') {
        if (!retried) {
          setTimeout(newSub.bind(null, key, cb, true), 500);
        }
        return;
      }

      Object.keys(subs).forEach(function(sub) {
        that._subLobber.add(sub, id);
      });

      if (cb) {
        cb();
      }
    });
  };

  var that = this;

  this._pubSubClient.subscribe(this.options.channel);
  this._pubSubClient.on("message", function(channel, message) {
    var parsed = JSON.parse(message);
    if (parsed.process !== that._uuid) {
      newSub(parsed.key);
    }
  });

  this._pubSubClient.on("subscribe", function() {
    that._client.keys("client:sub:*", function(err, keys) {
      async.each(keys, newSub, function(err) {
        if (callback) {
          callback(err, that);
        }
      });
    });
  });
}

util.inherits(RedisPersistence, AbstractPersistence);

/**
 * Private methods, not inteded to be called from outside
 *
 * @api private
 */

RedisPersistence.prototype._buildClient = function() {
  var options = this.options;
  var client = redis.createClient(
    options.port,
    options.host,
    options.redisOptions);

  if (options.password) {
    client.auth(options.password);
  }

  return client;

};

RedisPersistence.prototype.storeRetained = function(packet, cb) {
  this._client.hset("retained", packet.topic, JSON.stringify(packet), cb);
};

RedisPersistence.prototype.lookupRetained = function(pattern, done) {
  var that = this;
  var matched = [];
  var match = function(topic, cb) {
    that._client.hget("retained", topic, function(err, packet) {
      if (packet) {

        packet = JSON.parse(packet);
        packet.payload = new Buffer(packet.payload);
        
        matched.push(packet);
      }

      cb(err, matched);
    });
  };

  if (pattern.indexOf("#") >= 0 || pattern.indexOf("+") >= 0) {
    var qlobber = new Qlobber({
      separator: "/"
    });
    qlobber.add(pattern, true);

    this._client.hkeys("retained", function(err, topics) {
      topics.sort();
      topics = topics.filter(function(topic) {
        return qlobber.match(topic).length > 0;
      });

      async.each(topics, match, function(err) {
        done(err, matched);
      });
    });

    // do something
  } else {
    match(pattern, done);
  }
};

RedisPersistence.prototype.storeSubscriptions = function(client, cb) {
  if (client.clean) {
    return cb();
  }
  var clientSubKey = "client:sub:" + client.id;
  var that = this;
  var subscriptions = {};

  Object.keys(client.subscriptions).forEach(function(key) {
    if (client.subscriptions[key].qos > 0) {
      subscriptions[key] = client.subscriptions[key];
    }
  });

  var op = this._client.multi()
    .set(clientSubKey, JSON.stringify(subscriptions))
    .publish(this.options.channel, JSON.stringify({
      key: clientSubKey,
      process: this._uuid
    }))
    .expire(clientSubKey, this.options.ttl.subscriptions / 1000);

  Object.keys(subscriptions).forEach(function(e) {
    if (that._subLobber.match(e).indexOf(client.id) < 0) {
      that._subLobber.add(e, client.id);
    }
  });
  
  op.exec(cb);
};

RedisPersistence.prototype._cleanClient = function(client, done) {
  var that = this;
  if (client.clean) {
    var key = "client:sub:" + client.id;

    this._client.get(key, function(err, subs) {
      subs = JSON.parse(subs) || {};

      Object.keys(subs).forEach(function(sub) {
        that._subLobber.remove(sub, client.id);
      });

      async.parallel([
        function(cb) {
          that._client.del(key, cb);
        },
        function(cb) {
          that._client.del("packets:" + client.id, cb);
        }
      ], function(err) {
        if (done) {
          done(err, {});
        }
      });
    });

    return true;
  }

  return false;
};


RedisPersistence.prototype.lookupSubscriptions = function(client, cb) {
  if (this._cleanClient(client, cb)) {
    return;
  }

  var key = "client:sub:" + client.id;
  var subscriptions;

  var multi = this._client.multi();
  var that = this;

  multi.get(key, function(err, result) {

    subscriptions = JSON.parse(result) || {};

    Object.keys(subscriptions).forEach(function(sub) {
      that._subLobber.remove(sub, client.id);
    });
  });

  multi.del(key);

  multi.exec(function(err) {
    cb(err, subscriptions);
  });
};

RedisPersistence.prototype.storeOfflinePacket = function(packet, done) {
  var that = this;

  var matches = this._subLobber.match(packet.topic);
  async.each(matches, function(client, cb) {
    that._storePacket(client, packet, cb);
  }, done);
};

RedisPersistence.prototype._storePacket = function(client, packet, cb) {
  this._client.lpush("packets:" + client, JSON.stringify(packet), cb);
};

RedisPersistence.prototype.streamOfflinePackets = function(client, cb) {
  var that = this;

  if (this._cleanClient(client)) {
    return;
  }

  that._client.rpop("packets:" + client.id, function(err, result) {
    if (result) {
      result = JSON.parse(result);
      result.payload = new Buffer(result.payload);

      cb(null, result);

      that.streamOfflinePackets(client, cb);
    }
  });
};

RedisPersistence.prototype.close = function(done) {
  var that = this;
  async.parallel([
    function(cb) {
      that._client.quit(cb);
    },
    function(cb) {
      that._pubSubClient.quit(cb);
    }
  ], done);
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = RedisPersistence;
