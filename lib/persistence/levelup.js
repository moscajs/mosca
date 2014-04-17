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

var levelup = require("levelup");
var sublevel = require("level-sublevel");
var AbstractPersistence = require("./abstract");
var JSONB = require("json-buffer");
var util = require("util");
var ttl = require('level-ttl');
var Matcher = require("./matcher");
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
  this._subMatcher = new Matcher();

  var that = this;
  var stream = this._subscriptions.createReadStream();
  stream.on("data", function(data) {
    that._subMatcher.add(data.value.topic, data.key);
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
  var matcher = new Matcher();
  matcher.add(pattern, true);

  stream.on("error", cb);

  stream.on("end", function() {
    cb(null, matched);
  });

  stream.on("data", function(data) {
    if (matcher.match(data.key).length > 0) {
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
      if (that._subMatcher.match(key).indexOf(levelKey) < 0) {
        that._subMatcher.add(key, levelKey);
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

    subscriptions = subscriptions || {}

    if (client.clean) {
      that._clientSubscriptions.del(client.id, function() {
        var levelkeys = Object.keys(subscriptions).map(function(key) {
          // TODO we need to remove these from the subMatcher every time.
          var levelKey = util.format("%s:%s", key, client.id);
          that._subMatcher.remove(key, levelKey);
          return levelKey;
        });

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
      });
    } else if (done) {
      done(null, subscriptions);
    }
  });
};

LevelUpPersistence.prototype.storeOfflinePacket = function(packet, done) {
  var that = this;
  var subs = this._subMatcher.match(packet.topic);

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

    if (client.clean) {
      count++;
      that._offlinePackets.del(data.key, function() {
        count--;

        if (ended && count === 0 && done) {
          done();
        }
      });
    } else {
      data.value.payload = new Buffer(data.value.payload);
      cb(null, data.value);
    }
  });

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

LevelUpPersistence.prototype.deleteOfflinePacket = function(client, messageId, done) {

  var that = this;
  var prefix = util.format('%s:', client.id);
  var stream = that._offlinePackets.createReadStream({
    start : prefix,
    end : prefix + '~'
  });
  var found = false;

  stream.on("data", function(data) {
    if (data.value.messageId !== messageId) {
      return;
    }

    found = true;

    that._offlinePackets.del(data.key, function() {
      if (done) {
        done();
      }
    });
  });

  if (done) {
    stream.on("error", done);
    stream.on("end", function() {
      if (!found) {
        done();
      }
    });
  }
};

LevelUpPersistence.prototype.updateOfflinePacket = function(client, packet, newMessageId, done) {
  var that = this;
  var prefix = util.format('%s:', client.id);
  var stream = that._offlinePackets.createReadStream({
    start : prefix,
    end : prefix + '~'
  });
  var found = false;

  stream.on("data", function(data) {
    if (data.value.messageId !== packet.messageId) {
      return;
    }

    found = true;

    data.value.messageId = newMessageId;

    that._offlinePackets.put(data.key, data.value, function() {
      if (done) {
        done(null, data.value);
      }
    });
  });

  if (done) {
    stream.on("error", done);
    stream.on("end", function() {
      if (!found) {
        done();
      }
    });
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
