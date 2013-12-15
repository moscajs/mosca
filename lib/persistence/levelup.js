"use strict";

var levelup = require("levelup");
var sublevel = require("level-sublevel");
var AbstractPersistence = require("./abstract");
var JSONB = require("json-buffer");
var util = require("util");
var ttl = require('level-ttl');
var Qlobber = require("qlobber").Qlobber;
var async = require("async");
var extend = require("extend");
var defaults = {
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
 * A LevelUp-based persistance.
 *
 * The current options include:
 *  - `path`, the path to the database
 *  - `ttl`, an object containing three values:
 *    * `checkFrequency`, the frequency at which the
 *      the expiration will be checked. It defaults to 1 minute.
 *    * `subscriptions`, the time (ms) after which subscriptions
 *      will expire. It defaults to 1 hour.
 *    * `packets`, the time (ms) after which packets will expire.
 *      It defaults to 1 hour.
 *  - `db`, the AbstractLevelDown implementation.
 *  - all other `levelup` otions.
 *
 * @api public
 * @param {Object} options The options to create this persistance
 * @param {Function} callback Called when ready.
 */
function LevelUpPersistence(options, callback) {
  if (!(this instanceof LevelUpPersistence)) {
    return new LevelUpPersistence(options, callback);
  }

  this.options = extend(true, {}, defaults, options);
  this.options.valueEncoding = {
    encode : function (val) { return JSONB.stringify(val); },
    decode : function (val) { return JSONB.parse(val); },
    buffer : false,
    type   : "JSON-Buffers"
  };

  this.db = ttl(levelup(this.options.path, this.options), options.ttl);
  this._retained = this.db.sublevel("retained");
  this._clientSubscriptions = this.db.sublevel("clientSubscriptions");
  this._subscriptions = this.db.sublevel("subscriptions");
  this._offlinePackets = this.db.sublevel("offlinePackets");
  this._subLobber = new Qlobber({ separator: "/" });

  var that = this;
  var stream = this._subscriptions.createReadStream();
  stream.on("data", function(data) {
    that._subLobber.add(data.value.topic, data.key);
  });
  stream.on("end", function() {
    if (callback) {
      callback(null, that);
    }
  });
}

util.inherits(LevelUpPersistence, AbstractPersistence);

/**
 * Private methods, not inteded to be called from outside
 *
 * @api private
 */

LevelUpPersistence.prototype.storeRetained = function(packet, cb) {
  this._retained.put(packet.topic, packet, cb);
};

LevelUpPersistence.prototype.lookupRetained = function(pattern, cb) {
  var stream = this._retained.createReadStream();
  var matched = [];
  var qlobber = new Qlobber({ separator: '/' });
  qlobber.add(pattern, true);

  stream.on("error", cb);

  stream.on("end", function() {
    cb(null, matched);
  });

  stream.on("data", function(data) {
    if (qlobber.match(data.key).length > 0) {
      data.value.payload = new Buffer(data.value.payload);
      matched.push(data.value);
    }
  });
};

LevelUpPersistence.prototype.storeSubscriptions = function(client, done) {
  var that = this;
  var ttl = {
    ttl: that.options.ttl.subscriptions
  };
  var subscriptions = {};

  if (!client.clean) {
    Object.keys(client.subscriptions).forEach(function(key) {
      if (client.subscriptions[key].qos > 0) {
        subscriptions[key] = client.subscriptions[key];
      }
    });
    this._clientSubscriptions.put(client.id, subscriptions, ttl, done);
    Object.keys(subscriptions).forEach(function(key) {
      var sub = {
        client: client.id,
        topic: key,
        qos: subscriptions[key].qos
      };
      var levelKey = util.format("%s:%s", key, client.id);
      if (that._subLobber.match(key).indexOf(levelKey) < 0) {
        that._subLobber.add(key, levelKey);
      }
      that._subscriptions.put(levelKey, sub, ttl);
    });
  } else if (done) {
    done();
  }
};

var nop = function() {};
LevelUpPersistence.prototype.lookupSubscriptions = function(client, done) {
  var that = this;
  this._clientSubscriptions.get(client.id, function(err, subscriptions) {
    that._clientSubscriptions.del(client.id, function() {
      var levelkeys;

      levelkeys = Object.keys(subscriptions || {}).map(function(key) {
        // TODO we need to remove these from the subLobber every time.
        var levelKey = util.format("%s:%s", key, client.id);
        that._subLobber.remove(key, levelKey);
        return levelKey;
      });

      if (subscriptions && client.clean) {
        that.streamOfflinePackets(client, nop, function() {
          that._subscriptions.batch(levelkeys.map(function(levelKey) {
            return {
              key: levelKey,
              type: 'del'
            };
          }), function(err) {
            done(err, {});
          });
        });
      } else {
        subscriptions = subscriptions || {};

        if (done) {
          done(null, subscriptions);
        }
        return;
      } 
    });
  });
};

LevelUpPersistence.prototype.storeOfflinePacket = function(packet, done) {
  var that = this;
  var subs = this._subLobber.match(packet.topic);

  async.each(subs, function(key, cb) {
    that._subscriptions.get(key, function(err, sub) {
      if (err) {
        return cb(err);
      }
      that._storePacket(sub.client, packet, cb);
    });
  }, done);
};

LevelUpPersistence.prototype.streamOfflinePackets = function(client, cb, done) {

  var that = this;
  var prefix = util.format('%s:', client.id);
  var stream = that._offlinePackets.createReadStream({
    start : prefix,
    end : prefix + '~'
  });
  var count = 0;
  var ended = false;

  stream.on("data", function(data) {
    count++;
    that._offlinePackets.del(data.key, function() {
      count--;
      if (!client.clean) {
        data.value.payload = new Buffer(data.value.payload);
        cb(null, data.value);
      }
      if (ended && count === 0 && done) {
        done();
      }
    });
  });

  if (cb) {
    stream.on("error", cb);
  }
  
  stream.on("end", function() {
    ended = true;
    if (count === 0 && done) {
      done();
    }
  });

  if (done) {
    stream.on("error", done);
  }
};

LevelUpPersistence.prototype._storePacket = function(client, packet, cb) {
  var key = util.format("%s:%s", client, new Date().toISOString());
  var ttl = {
    ttl: this.options.ttl.subscriptions
  };
  this._offlinePackets.put(
    key, packet, ttl, cb);
};

LevelUpPersistence.prototype.close = function(cb) {
  this.db.close(cb);
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = LevelUpPersistence;
