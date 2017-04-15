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
var mongo = require('mongodb');
var MongoClient = mongo.MongoClient;
var util = require("util");
var steed = require("steed")();
var Matcher = require("./matcher");
var topicPatterns = require("./utils").topicPatterns;
var extend = require("extend");
var defaults = {
  ttl: {
    // TTL for subscriptions is 1 hour
    subscriptions: 60 * 60 * 1000,

    // TTL for packets is 1 hour
    packets: 60* 60 * 1000,

  },
  mongo: {},
  storeMessagesQos0: false
};

/**
 * A persistance based on MongoDB.
 * It currently performs in save mode.
 *
 * The current options include:
 *  - `url`, the connection URL of the database
 *  - `ttl`, an object containing three values:
 *    * `subscriptions`, the time (ms) after which subscriptions
 *      will expire. It defaults to 1 hour.
 *    * `packets`, the time (ms) after which packets will expire.
 *      It defaults to 1 hour.
 *  - `mongo`, all the options for the MongoDB driver.
 *  - `connection`, a MongoDB client to be reused
 *  - `storeMessagesQos0` store messages with qos 0, default false
 *     like mosquitto option 'queue_qos0_messages', non-standard option
 *
 * @api public
 * @param {Object} options The options, as describe above.
 * @param {Function} done The callback that will be called
 *                        when the persistance is ready
 */
function MongoPersistence(options, done) {
  if (!(this instanceof MongoPersistence)) {
    return new MongoPersistence(options, done);
  }


  this.options = extend(true, {}, defaults, options);
  this.options.mongo.safe = true;

  // This offlineMessageTimeout(in milliseconds) can set the maximum life time for stored offline messages. This is a
  // Mongo-only feature which relies on TTL index. Since Mongo checks expired entries on a minute-based clock, the
  // actual lifetime is ceil(offlineMessageTimeout/60000) minutes. For this reason, we do not have an unit test
  // for this feature.
  if (options.offlineMessageTimeout) {
    this.options.ttl.packets = options.offlineMessageTimeout;
  }

  var that = this;

  var connected = function(err, db) {
    if (err) {
      if (done) {
        return done(err);
      }
      // we have no way of providing an error handler
      throw err;
    }

    that.db = db;
    steed.parallel([
      function(cb) {
        db.collection("subscriptions", function(err, coll) {
          that._subscriptions = coll;
          steed.parallel([
            that._subscriptions.ensureIndex.bind(that._subscriptions, "client"),
            that._subscriptions.ensureIndex.bind(that._subscriptions, { "added": 1 }, { expireAfterSeconds: Math.round(that.options.ttl.subscriptions / 1000 )} )
          ], cb);
        });
      },
      function(cb) {
        db.collection("packets", function(err, coll) {
          if (err) {
            return cb(err);
          }

          that._packets = coll;
          steed.series([
            that._packets.ensureIndex.bind(that._packets, "client"),
            function(cb){
              // Check expiration indexes. If not exist, create; If exist but with different TTL, delete and recreate; Otherwise, do nothing.
              that._packets.indexes(function(error, colIndexes){
                if (error) {
                  cb(error);
                } else {
                  var addedIndexKey = {"added": 1};
                  var addedIndexKeyString = 'added_1'; // If addedIndex changes, this value should also be changed accordingly.
                  var addedIndexObj = colIndexes.filter(function(obj){
                    return obj.name == addedIndexKeyString;
                  });
                  var packetTTLInSeconds = Math.round(that.options.ttl.packets / 1000);
                  if (addedIndexObj.length <= 0 || addedIndexObj[0].expireAfterSeconds != packetTTLInSeconds) {
                    if (addedIndexObj.length > 0) {
                      // Different index TTL, recreate index to make sure the TTL is set to the new number.
                      that._packets.dropIndex(addedIndexKeyString, function (error, result){
                        if (error) {
                          cb(error);
                        } else {
                          that._packets.createIndex(addedIndexKey, {expireAfterSeconds: packetTTLInSeconds}, cb);
                        }
                      });
                    } else {
                      // Create Index for the first time.
                      that._packets.createIndex(addedIndexKey, {expireAfterSeconds: packetTTLInSeconds}, cb);
                    }
                  } else {
                    cb(null);
                  }
                }
              });
            }
          ], cb);
        });
      },
      function(cb) {
        db.collection("retained", function(err, coll) {
          that._retained = coll;
          that._retained.ensureIndex("topic", { unique: true }, cb);
        });
      }
    ], function(err) {
      if (done) {
        done(err, that);
      }
    });
  };

  // Connect to the db
  if (options.connection) {
    connected(null, this.options.connection);
  } else {
    MongoClient.connect(this.options.url, this.options.mongo, connected);
  }
}

util.inherits(MongoPersistence, AbstractPersistence);

/**
 * Private methods, not inteded to be called from outside
 *
 * @api private
 */
MongoPersistence.prototype.storeSubscriptions = function(client, done) {

  var subscriptions;
  var that = this;

  if (!client.clean) {
    subscriptions = Object.keys(client.subscriptions).filter(function(key) {
      return client.subscriptions[key].qos > 0;
    });

    steed.each(subscriptions, function(key, cb) {
      that._subscriptions.findAndModify({
        client: client.id,
        topic: key
      }, [['date', -1]], {
        $set: {
          client: client.id,
          topic: key,
          qos: client.subscriptions[key].qos,
          added: new Date()
        }
      }, { upsert: true}, cb);
    }, done);
  } else if (done) {
    return done();
  }
};

MongoPersistence.prototype.lookupSubscriptions = function(client, done) {
  var that = this;
  this._subscriptions.find({ client: client.id })
                     .toArray(function(err, subscriptions) {

    var now = Date.now();

    subscriptions = (subscriptions || []).reduce(function(obj, sub) {
      // mongodb TTL is not precise
      if (sub.added.getTime() + that.options.ttl.subscriptions > now) {
        obj[sub.topic] = {
          qos: sub.qos
        };
      }
      return obj;
    }, {});

    if (!client.clean) {
      done(err, subscriptions);
      return;
    }

    var toExecute = [
      function removeSubscriptions(cb) {
        that._subscriptions.remove({ client: client.id }, cb);
      },
      function removePackets(cb) {
        that._packets.remove({ client: client.id }, cb);
      }
    ];

    steed.parallel(toExecute, function(err) {
      done(null, {});
    });
  });
};

MongoPersistence.prototype.storeRetained = function(packet, cb) {
  if (packet.payload.length > 0) {
    this._retained.update(
      { topic: packet.topic },
      packet,
      {
        upsert: true,
        w: 1
      },
      function(err, n, result){
        if(cb) {
          return cb(err);
        }
      });
  } else {
    this._retained.remove(
      { topic: packet.topic },
      { w: 1 },
      cb);
  }
};

MongoPersistence.prototype.lookupRetained = function(pattern, cb) {
  var regexp = new RegExp(pattern.replace(/(#|\+)/, ".+").replace('\\', '\\\\'));
  var stream = this._retained.find({ topic: { $regex: regexp } }).stream();
  var matched = [];
  var matcher = new Matcher();
  matcher.add(pattern, true);

  stream.on("error", cb);

  stream.on("end", function() {
    cb(null, matched);
  });

  stream.on("data", function(data) {
    if (matcher.match(data.topic).size > 0) {
      data.payload = data.payload.buffer;
      matched.push(data);
    }
  });
};

MongoPersistence.prototype.storeOfflinePacket = function(packet, done) {

  var patterns = topicPatterns(packet.topic);

  var stream = this._subscriptions.find({ topic: { $in: patterns } }).stream();
  var ended = false;
  var completed = 0;
  var started = 0;
  var that = this;

  if (done) {
    stream.on("error", done);
  }

  stream.on("data", function(data) {
    started++;

    that._storePacket(data.client, packet, function(err) {
      if (err) {
        return stream.emit("error", err);
      }

      // TODO handle the err in case of no callback
      completed++;

      if (done && ended && started === completed) {
        done();
      }
    });
  });

  stream.on("end", function() {
    ended = true;
    if (done && started === completed) {
      done();
    }
  });
};

MongoPersistence.prototype._storePacket = function(client, packet, cb) {
  var toStore = {
    client: client,
    packet: packet,
    added: new Date()
  };

  this._packets.insert(toStore, {w:1}, cb);
};

MongoPersistence.prototype.streamOfflinePackets = function(client, cb, done) {
 
  var stream = this._packets.find({ client: client.id }).stream();
  var that = this;

  var now = Date.now();

  // for testing
  if(done)
    stream.on("end", done);

  stream.on("error", cb);

  stream.on("data", function(data) {
    // mongodb TTL is not precise
    // mongodb automaticly remove the packet
    if (data.added.getTime() + that.options.ttl.packets > now) {
      data.packet.payload = data.packet.payload.buffer;
      cb(null, data.packet);
    }
  });

};

MongoPersistence.prototype.deleteOfflinePacket = function(client, messageId, cb) {
  var toSearch = {
    client: client.id,
    'packet.messageId': messageId
  };

  this._packets.remove(toSearch, {w:1}, cb);
};

MongoPersistence.prototype.updateOfflinePacket = function(client, messageId, packet, cb) {
  this._packets.update({
    client: client.id,
    'packet.messageId': messageId
  }, {
    $set: { 'packet.messageId': packet.messageId }
  }, {w:1}, function(err) {
    cb(err, packet);
  });
};

MongoPersistence.prototype.close = function(cb) {
  if (this.db && this.options.autoClose !== false) {
    this.db.close(cb);
  } else {
    cb();
  }
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = MongoPersistence;
