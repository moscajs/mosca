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

var AbstractPersistence = require("./abstract");
var from = require("array-from");
var Redis = require("ioredis");
var util = require("util");
var Matcher = require("./matcher");
var steed = require("steed")();
var extend = require("extend");
var shortid = require("shortid");
var defaults = {
  channel: "$SYS/moscaSync",
  ttl: {
    // TTL for subscriptions is 1 hour
    subscriptions: 60 * 60 * 1000,

    // TTL for packets is 1 hour
    packets: 60 * 60 * 1000
  },
  storeMessagesQos0: false
};

/**
 * A Redis-based persistance.
 *
 * The current options include:
 *  - `port`, the Redis' port.
 *  - `host`, the Redis' host.
 *  - `db`, the Redis' database.
 *  - `password`, the Redis' password.
 *  - `redisOpts`, the options for the Redis client.
 *  - `channel`, the pub/sub channel that will be used to synchronize
 *    the various clients. Defaults to `'moscaSync'`.
 *  - `ttl`, an object containing three values:
 *    * `subscriptions`, the time (ms) after which subscriptions
 *      will expire. It defaults to 1 hour.
 *    * `packets`, the time (ms) after which packets will expire.
 *  - `storeMessagesQos0` store messages with qos 0, default false
 *     like mosquitto option 'queue_qos0_messages', non-standard option
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

  this._subMatcher = new Matcher();

  this._client = this._buildClient();
  this._pubSubClient = this._buildClient();
  this._id = shortid.generate();

  this._packetKeyTTL = this.options.ttl.packets;
  this._listKeyTTL = this._packetKeyTTL * 2; // list key should live longer than packet key
  this._closing = false;
  this._closed = false;

  var fetchAndUpdateLocalSub = function(key, unsubs, retried, cb) {
    that._client.get(key, function(err, result) {
      if (err) {
        if (cb) {
          cb(err);
        } else {
          return;
        }
      }

      var subs = JSON.parse(result);
      if (!result || typeof subs !== 'object') {
        if (!retried) {
          setTimeout(fetchAndUpdateLocalSub.bind(null, key, unsubs, true, cb), 500);
        } else {
          cb && cb();
        }
        return;
      }

      updateLocalSub(key, subs, unsubs);

      if (cb) {
        cb();
      }
    });
  };

  var updateLocalSub = function(key, subs, unsubs) {
    var xs = key.split(":");
    var id = key.substr(xs[0].length + xs[1].length + 2);

    Object.keys(subs).forEach(function(sub) {
      that._subMatcher.add(sub, id);
    });

    if( unsubs ) {
      unsubs.forEach(function(unsub) {
        that._subMatcher.remove(unsub, id);
      });
    }
  };

  var that = this;

  this._pubSubClient.subscribe(this.options.channel, function(){
    if (that._explicitlyClosed()) {
      return;
    }
    var subsStream = that._client.scanStream({
      match: "client:sub:*",
      count: 25000
    });
    var pipeline = that._client.pipeline();
    var total = 0;
    var done = null;

    subsStream.on('data', function(moreKeys){
      total += moreKeys.length;
      moreKeys.map(function(k){
        pipeline.get(k, function(err, result) {
          if (err) {
            done && done(err);
            return;
          }
          var subs = JSON.parse(result);
          if (!result || typeof subs !== 'object') {
            done && done();
            return;
          }
          updateLocalSub(k, subs);
          done && done();
        });
      });
    });

    subsStream.on('end', function(){
      if (total === 0) {
        return callback(null, that);
      }
      done = function() {
        if (--total === 0 && callback) {
          callback(null, that);
          callback = null;
        }
      };
      pipeline.exec();
    });
  });

  this._pubSubClient.on("message", function(channel, message) {
    if (that._explicitlyClosed()) {
      return;
    }
    var parsed = JSON.parse(message);
    if (parsed.process !== that._id) {
      updateLocalSub(parsed.key, parsed.subs, parsed.unsubs);
    }
  });
}

util.inherits(RedisPersistence, AbstractPersistence);

/**
 * Private methods, not inteded to be called from outside
 *
 * @api private
 */

RedisPersistence.prototype._buildClient = function() {
  var options = this.options.redisOptions || {};

  if (this.options.host) {
    options.host = this.options.host;
  }

  if (this.options.port) {
    options.port = this.options.port;
  }

  if (this.options.db) {
    options.db = this.options.db;
  }

  if (this.options.password) {
    options.password = this.options.password;
  }

  return new Redis(options);
};

RedisPersistence.prototype.storeRetained = function(packet, cb) {
  if (this._explicitlyClosed()) {
    return cb && cb(new Error('Explicitly closed'));
  }
  if (packet.payload.length > 0) {
    this._client.hset("retained", packet.topic, JSON.stringify(packet), cb);
  } else {
    this._client.hdel("retained", packet.topic, cb);
  }
};

RedisPersistence.prototype.lookupRetained = function(pattern, done) {
  if (this._explicitlyClosed()) {
    return done && done(new Error('Explicitly closed'));
  }
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
    var matcher = new Matcher();
    matcher.add(pattern, true);

    this._client.hkeys("retained", function(err, topics) {
      topics.sort();
      topics = topics.filter(function(topic) {
        return matcher.match(topic).size > 0;
      });

      steed.each(topics, match, function(err) {
        done(err, matched);
      });
    });

    // do something
  } else {
    match(pattern, done);
  }
};

RedisPersistence.prototype.storeSubscriptions = function(client, cb) {
  if (this._explicitlyClosed()) {
    return cb && cb(new Error('Explicitly closed'));
  }
  if (client.clean) {
    return cb && cb();
  }
  var clientSubKey = "client:sub:" + client.id;
  var that = this;
  var subscriptions = {};

  Object.keys(client.subscriptions).forEach(function(key) {
    if (client.subscriptions[key].qos > 0) {
      subscriptions[key] = client.subscriptions[key];
    }
  });

  this._client.get(clientSubKey, function(err, currentSubs){
    var unsubs;
    if( !err && currentSubs ) {
      currentSubs = JSON.parse(currentSubs);
      unsubs = Object.keys(currentSubs).filter(function (topic) {
        return !subscriptions[topic];
      });
      unsubs.forEach(function (topic) {
        that._subMatcher.remove(topic, client.id);
      });
    }
    var op = that._client.multi()
      .set(clientSubKey, JSON.stringify(subscriptions))
      .publish(that.options.channel, JSON.stringify({
        key: clientSubKey,
        subs: subscriptions,
        unsubs: unsubs,
        process: that._id
      }))
      .pexpire(clientSubKey, that.options.ttl.subscriptions);

    Object.keys(subscriptions).forEach(function(e) {
      that._subMatcher.add(e, client.id);
    });

    op.exec(cb);
  });
};

RedisPersistence.prototype._cleanClient = function(client, done) {
  var that = this;

  var key = "client:sub:" + client.id;

  this._client.get(key, function(err, subs) {
    subs = JSON.parse(subs) || {};

    Object.keys(subs).forEach(function(sub) {
      that._subMatcher.remove(sub, client.id);
    });

    steed.parallel([
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
};

RedisPersistence.prototype.lookupSubscriptions = function(client, cb) {
  if (this._explicitlyClosed()) {
    return cb && cb(new Error('Explicitly closed'));
  }

  if (client.clean) {
    this._cleanClient(client, cb);
  }else{
    var key = "client:sub:" + client.id;
    var subscriptions;

    var multi = this._client.multi();

    multi.get(key);

    multi.exec(function(err, result) {
      subscriptions = JSON.parse(result[0][1]) || {};
      cb(err, subscriptions);
    });
  }
};

RedisPersistence.prototype.storeOfflinePacket = function(packet, done) {
  if (this._explicitlyClosed()) {
    return done && done(new Error('Explicitly closed'));
  }

  var that = this;

  var matches = this._subMatcher.match(packet.topic);
  var pipeline = this._client.pipeline();
  steed.each(from(matches), function(client, cb) {
    that._storePacket(client, packet, pipeline, cb);
  }, function(){
    pipeline.exec(done);
  });
};

RedisPersistence.prototype._storePacket = function(client, packet, pipeline, cb) {
  if (this._explicitlyClosed()) {
    return cb && cb(new Error('Explicitly closed'));
  }

  var packetKey = "packets:" + client + ":" + packet.messageId,
      listKey = "packets:" + client;

  pipeline.multi()
    .set(packetKey, JSON.stringify(packet))
    .pexpire(packetKey, this._packetKeyTTL)
    .rpush(listKey, packetKey)
    .pexpire(listKey, this._listKeyTTL)
    .exec();

  cb();
};

var keyRegexp = /^([^:]+):(.+):([^:]+)$/;
RedisPersistence.prototype.streamOfflinePackets = function(client, cb, done) {
  if (this._explicitlyClosed()) {
    return cb && cb(new Error('Explicitly closed'));
  }

  var that = this,
      listKey = "packets:" + client.id;

  that._client.lrange(listKey, 0, 10000, function(err, results) {

    var total = results.length;

    // for testing
    if(done && total === 0)
      done();

    function emit(key, result) {
      if (result) {
        var match = key.match(keyRegexp);
        result = JSON.parse(result);
        result.payload = new Buffer(result.payload);
        result.messageId = match[3];

        cb(null, result);
      }
    }

    function fetch(multi, key) {
      return multi.get(key);
    }

    results.reduce(fetch, that._client.multi()).exec(function(err,multiResults){
      if(!multiResults && done) {
        done(err);
        return;
      }
      multiResults.forEach(function(multiResult, i){
        var key = results[i];
        var result = multiResult[1];
        total --;
        // If we don't get result for given packet key. It means
        // that packet has expired. Just clean it from client packets key
        if(!result) {
          that._client.lrem(listKey, 0, key);
          // for testing
          if(done && total === 0)
            done();
          return;
        }
        emit(key, result);
      });
    });
  });
};

RedisPersistence.prototype.deleteOfflinePacket = function(client, messageId, done) {
  if (this._explicitlyClosed()) {
    return done && done(new Error('Explicitly closed'));
  }

  var that = this;
  var packetKey = "packets:" + client.id + ":" + messageId;

  this._client.multi()
    .del(packetKey)
    .lrem("packets:" + client.id, 1, packetKey)
    .exec(done);
};

RedisPersistence.prototype.updateOfflinePacket = function(client, messageId, packet, done) {
  if (this._explicitlyClosed()) {
    return done && done(new Error('Explicitly closed'));
  }

  var that = this;
  var oldPacketKey = "packets:" + client.id + ":" + messageId;
  var newPacketKey = "packets:" + client.id + ":" + packet.messageId;
  var listKey = "packets:" + client.id;

  that._client.multi()
      .rename(oldPacketKey, newPacketKey)
      .lrem(listKey, 1, oldPacketKey)
      .rpush(listKey, newPacketKey)
      .pexpire(listKey, this._listKeyTTL)
      .exec(function(err) {
        done(err, packet);
      });
};

RedisPersistence.prototype.close = function(done) {
  if (this._closed) {
    return done && done();
  }
  if (this._closing) {
    return done && this.once('close', done);
  }
  this._closing = true;

  var that = this;

  steed.each([
    "_client", "_pubSubClient"
  ], function(client, cb) {
    if (that[client]) {
      that[client].quit(function quit(err) {
        delete that[client];
        cb(err);
      });
    } else {
      cb();
    }
  }, function() {
    that._closed = true;
    that.emit('close');
    done();
  });
};

/**
 * Is the client explicitly being closed or already closed
 *
 * @api private
 */
RedisPersistence.prototype._explicitlyClosed = function(done) {
  return this._closing || this._closed;
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = RedisPersistence;
