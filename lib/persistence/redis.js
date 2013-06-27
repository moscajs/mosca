"use strict";

var AbstractPersistence = require("./abstract");
var redis = require("redis");
var util = require("util");
var Qlobber = require("qlobber").Qlobber;
var async = require("async");

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
 */
function RedisPersistence(options) {
  if (!(this instanceof RedisPersistence)) {
    return new RedisPersistence(options);
  }

  options.ttl = options.ttl || {};

  // TTL for subscriptions is 1 hour
  options.ttl.subscriptions = options.ttl.subscriptions || 60 * 60 * 1000;

  // TTL for packets is 1 hour
  options.ttl.packets = options.ttl.packets || 60 * 60 * 1000;

  options.channel = options.channel || "moscaSync";

  this.options = options;

  this._subLobber = new Qlobber({ separator: "/" });

  this._client = this._buildClient();
  this._pubSubClient = this._buildClient();

  var newSub = function(key, cb, retried) {
    that._client.get(key, function(err, subs) {
      var id = key.split(":")[2];
      subs = JSON.parse(subs);

      if (typeof subs !== 'object') {
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

  this._pubSubClient.subscribe(options.channel);
  this._pubSubClient.on("message", function(channel, message) {
    newSub(message);
  });

  var that = this;

  this._client.keys("client:sub:*", function(err, keys) {
    async.each(keys, newSub);
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
        matched.push(JSON.parse(packet));
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
    .publish(this.options.channel, clientSubKey)
    .expire(clientSubKey, this.options.ttl.subscriptions / 1000);

  Object.keys(subscriptions).forEach(function(e) {
    that._subLobber.add(e, client.id);
  });
  
  op.exec(cb);
};

RedisPersistence.prototype._cleanClient = function(client, cb) {
  var that = this;
  if (client.clean) {
    var key = "client:sub:" + client.id;

    this._client.multi()
      .get(key, function(err, subs) {
        subs = JSON.parse(subs);
        Object.keys(subs).forEach(function(sub) {
          that._subLobber.remove(sub, client.id);
        });
      })
      .del(key)
      .del("packets:" + client.id)
      .exec(function(err) {
        if (cb) {
          cb(err, {});
        }
      });
    return true;
  }

  return false;
};


RedisPersistence.prototype.lookupSubscriptions = function(client, cb) {
  if (this._cleanClient(client, cb)) {
    return;
  }

  this._client.get("client:sub:" + client.id, function(err, result) {
    cb(err, JSON.parse(result) || {});
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
      cb(null, JSON.parse(result));
      that.streamOfflinePackets(client,cb);
    }
  });
};

RedisPersistence.prototype.close = function(cb) {
  if (cb) {
    this._client.on("end", cb);
  }

  this._pubSubClient.end();
  this._client.quit();
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = RedisPersistence;
