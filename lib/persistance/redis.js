"use strict";

var AbstractPersistence = require("./abstract");
var redis = require("redis");
var util = require("util");
var Qlobber = require("qlobber").Qlobber;
var async = require("async");

function RedisPersistance(options) {
  if (!(this instanceof RedisPersistance)) {
    return new RedisPersistance(options);
  }

  options.ttl = options.ttl || {};

  // TTL for subscriptions is 1 hour
  options.ttl.subscriptions = options.ttl.subscriptions || 60 * 60 * 1000;

  // TTL for packets is 1 hour
  options.ttl.packets = options.ttl.packets || 60 * 60 * 1000;

  this.options = options;

  this._client = redis.createClient(
    options.port,
    options.host,
    options.redisOptions);

  this._subLobber = new Qlobber({ separator: "/" });

  if (options.password) {
    this._client.auth(options.password);
  }

  var that = this;

  this._client.keys("client:sub:*", function(err, keys) {
    async.each(keys, function(key, cb) {
      that._client.get(key, function(err, subs) {
        var id = key.split(":")[2];
        subs = JSON.parse(subs);
        Object.keys(subs).forEach(function(sub) {
          that._subLobber.add(sub, id);
        });
        cb();
      });
    });
  });
}

util.inherits(RedisPersistance, AbstractPersistence);

RedisPersistance.prototype.storeRetained = function(packet, cb) {
  this._client.hset("retained", packet.topic, JSON.stringify(packet), cb);
};

RedisPersistance.prototype.lookupRetained = function(pattern, done) {
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

RedisPersistance.prototype.storeSubscriptions = function(client, cb) {
  if (client.clean) {
    return cb();
  }
  var clientSubKey = "client:sub:" + client.id;
  var that = this;

  var op = this._client.multi()
    .set(clientSubKey, JSON.stringify(client.subscriptions))
    .expire(clientSubKey, this.options.ttl.subscriptions / 1000);

  Object.keys(client.subscriptions).forEach(function(e) {
    that._subLobber.add(e, client.id);
  });
  
  op.exec(cb);
};

RedisPersistance.prototype._cleanClient = function(client, cb) {
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


RedisPersistance.prototype.lookupSubscriptions = function(client, cb) {
  if (this._cleanClient(client, cb)) {
    return;
  }

  this._client.get("client:sub:" + client.id, function(err, result) {
    cb(err, JSON.parse(result) || {});
  });
};

RedisPersistance.prototype.storeOfflinePacket = function(packet, done) {
  var that = this;

  var matches = this._subLobber.match(packet.topic);
  async.each(matches, function(client, cb) {
    that._client.lpush("packets:" + client, JSON.stringify(packet), cb);
  }, done);
};

RedisPersistance.prototype.streamOfflinePackets = function(client, cb) {
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

RedisPersistance.prototype.close = function(cb) {
  if (cb) {
    this._client.on("end", cb);
  }

  this._client.quit();
};

module.exports = RedisPersistance;
