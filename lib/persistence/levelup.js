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

var levelup = require("levelup");
var from = require("array-from");
var sublevel = require("level-sublevel");
var AbstractPersistence = require("./abstract");
var JSONB = require("json-buffer");
var util = require("util");
var msgpack = require("msgpack5")();
var Matcher = require("./matcher");
var steed = require("steed");
var extend = require("extend");
var defaults = {
  valueEncoding: {
    encode: function(val) {
      return msgpack.encode(val).slice();
    },
    decode: function(val) {
      return msgpack.decode(val);
    },
    type: "msgpack5",
    buffer: true
  },
  ttl: {
    // TTL for subscriptions is 1 hour
    subscriptions: 60 * 60 * 1000,

    // TTL for packets is 1 hour
    packets: 60 * 60 * 1000,
  },
  storeMessagesQos0: false
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
 *  - `storeMessagesQos0` store messages with qos 0, default false
 *     like mosquitto option 'queue_qos0_messages', non-standard option
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


  this.db = levelup(this.options.path, this.options);

  var db = sublevel(this.db);

  this._retained = db.sublevel("retained");
  this._clientSubscriptions = db.sublevel("clientSubscriptions");
  this._subscriptions = db.sublevel("subscriptions");
  this._offlinePackets = db.sublevel("offlinePackets");
  this._subMatcher = new Matcher();
  this._packetCounter = 0;
  this._lastStoredPacketTime = Date.now();
  this._streams = [];

  var that = this;
  var stream = this._subscriptions.createReadStream();
  this._streams.push(stream);
  stream.on("data", function(data) {
    that._subMatcher.add(data.value.topic, data.key);
  });
  stream.on("end", function() {
    that._cleanupStream(stream);
    if (callback) {
      callback(null, that);
    }
  });
  stream.on("close", function() {
    that._cleanupStream(stream);
  });
}

util.inherits(LevelUpPersistence, AbstractPersistence);

/**
 * Private methods, not inteded to be called from outside
 *
 * @api private
 */

LevelUpPersistence.prototype.storeRetained = function(packet, cb) {
  if (packet.payload.length > 0) {
    this._retained.put(packet.topic, packet, cb);
  } else {
    this._retained.del(packet.topic, cb);
  }
};

LevelUpPersistence.prototype.lookupRetained = function(pattern, cb) {
  var that = this;
  var matched = [];
  var matcher = new Matcher();
  var stream = this._retained.createReadStream();
  this._streams.push(stream);
  matcher.add(pattern, true);

  stream.on("error", cb);

  stream.on("end", function() {
    that._cleanupStream(stream);
    cb(null, matched);
  });

  stream.on("close", function() {
    that._cleanupStream(stream);
  });

  stream.on("data", function(data) {
    if (matcher.match(data.key).size > 0) {
      matched.push(data.value);
    }
  });
};

LevelUpPersistence.prototype.storeSubscriptions = function(client, done) {
  var that = this;
  var subscriptions = {};
  var now = Date.now();

  if (!client.clean) {
    Object.keys(client.subscriptions).forEach(function(key) {
      if (client.subscriptions[key].qos > 0) {
        subscriptions[key] = client.subscriptions[key];
        subscriptions[key].ttl = that.options.ttl.subscriptions + now;
      }
    });
    this._clientSubscriptions.put(client.id, subscriptions, done);
    Object.keys(subscriptions).forEach(function(key) {
      var sub = {
        client: client.id,
        topic: key,
        ttl: that.options.ttl.subscriptions + now,
        qos: subscriptions[key].qos
      };
      var levelKey = util.format("%s:%s", key, client.id);
      that._subMatcher.add(key, levelKey);
      that._subscriptions.put(levelKey, sub);
    });
  } else if (done) {
    done();
  }
};

var nop = function() {};
LevelUpPersistence.prototype.lookupSubscriptions = function(client, done) {
  var that = this;
  this._clientSubscriptions.get(client.id, function(err, subscriptions) {
    var toRemove = [];

    subscriptions = subscriptions || {};

    Object.keys(subscriptions).forEach(function(key) {
      var levelKey = util.format("%s:%s", key, client.id);
      if (subscriptions[key].ttl <= Date.now()) {
        delete subscriptions[key];
        that._subMatcher.remove(key, levelKey);
        toRemove.push(levelKey);
      }
    });

    if (client.clean) {
      that._clientSubscriptions.del(client.id, function() {
        Object.keys(subscriptions).forEach(function(key) {
          // TODO we need to remove these from the subMatcher every time.
          var levelKey = util.format("%s:%s", key, client.id);
          that._subMatcher.remove(key, levelKey);
          toRemove.push(levelKey);
        });

        that.streamOfflinePackets(client, nop, function() {
          that._subscriptions.batch(toRemove.map(function(levelKey) {
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
  steed.map(from(subs), function(key, cb) {
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
  var count = 0;
  var ended = false;
  var stream = that._offlinePackets.createReadStream({
    start : prefix,
    end : prefix + '~'
  });
  this._streams.push(stream);

  stream.on("data", function(data) {

    if (client.clean || data.value.ttl <= Date.now()) {
      count++;
      that._offlinePackets.del(data.key, function() {
        count--;

	// for testing
        if (ended && count === 0 && done) {
          done();
        }
      });
    } else {
      cb(null, data.value);
    }
  });

  stream.on("end", function() {
    that._cleanupStream(stream);
    ended = true;

    // for testing
    if (count === 0 && done) {
      done();
    }
  });

  stream.on("close", function() {
    that._cleanupStream(stream);
  });

  // for testing
  if (done) {
    stream.on("error", done);
  }
};

LevelUpPersistence.prototype.deleteOfflinePacket = function(client, messageId, done) {
  var that = this;
  var prefix = util.format('%s:', client.id);
  var found = false;
  var stream = that._offlinePackets.createReadStream({
    start : prefix,
    end : prefix + '~'
  });
  this._streams.push(stream);

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

  stream.on("end", function() {
    that._cleanupStream(stream);
  });

  stream.on("close", function() {
    that._cleanupStream(stream);
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

LevelUpPersistence.prototype.updateOfflinePacket = function(client, messageId, packet, done) {
  var that = this;
  var prefix = util.format('%s:', client.id);
  var found = false;
  var stream = that._offlinePackets.createReadStream({
    start : prefix,
    end : prefix + '~'
  });
  this._streams.push(stream);

  stream.on("data", function(data) {
    if (data.value.messageId !== messageId) {
      return;
    }

    found = true;

    data.value.messageId = packet.messageId;

    that._offlinePackets.put(data.key, data.value, function() {
      if (done) {
        done(null, packet);
      }
    });
  });

  stream.on("end", function() {
    that._cleanupStream(stream);
  });

  stream.on("close", function() {
    that._cleanupStream(stream);
  });

  if (done) {
    stream.on("error", done);
    stream.on("end", function() {
      if (!found) {
        done(null, packet);
      }
    });
  }
};

LevelUpPersistence.prototype._storePacket = function(client, packet, cb) {
  var currentTime = Date.now();
  if (currentTime !== this._lastStoredPacketTime) {
    this._packetCounter = 0;
  }
  this._lastStoredPacketTime = currentTime;
  var key = util.format("%s:%d:%d", client, currentTime, ++this._packetCounter);
  packet.ttl = this.options.ttl.packets + currentTime;
  this._offlinePackets.put(key, packet, cb);
};

LevelUpPersistence.prototype.close = function(cb) {
  this._streams.forEach(function(stream) {
    stream.destroy();
  });
  this.db.close(cb);
};

LevelUpPersistence.prototype._cleanupStream = function(stream) {
  var index = this._streams.indexOf(stream);
  if (index !== -1) {
    this._streams.splice(index, 1);
  }
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = LevelUpPersistence;
