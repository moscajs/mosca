"use strict";

var AbstractPersistence = require("./abstract");
var mongo = require('mongodb');
var MongoClient = mongo.MongoClient;
var util = require("util");
var async = require("async");
var Qlobber = require("qlobber").Qlobber;
var topicPatterns = require("./utils").topicPatterns;
var extend = require("extend");
var defaults = {
  ttl: {
    // TTL for subscriptions is 1 hour
    subscriptions: 60 * 60 * 1000,

    // TTL for packets is 1 hour
    packets: 60 * 60 * 1000,
  },
  mongo: {}
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
    async.parallel([
      function(cb) {
        db.collection("subscriptions", function(err, coll) {
          that._subscriptions = coll;
          async.parallel([
            that._subscriptions.ensureIndex.bind(that._subscriptions, "client"),
            that._subscriptions.ensureIndex.bind(that._subscriptions, { "added": 1 }, { expireAfterSeconds: Math.round(that.options.ttl.subscriptions / 1000 )} )
          ], cb);
        });
      },
      function(cb) {
        db.collection("packets", function(err, coll) {
          that._packets = coll;
          that._packets.ensureIndex("client", cb);
        });
      },
      function(cb) {
        db.collection("retained", function(err, coll) {
          that._retained = coll;
          that._retained.ensureIndex("topic", cb);
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

    async.each(subscriptions, function(key, cb) {
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

    var toExecute = [
      function removeSubscriptions(cb) {
        that._subscriptions.remove({ client: client.id }, cb);
      }
    ];

    if (client.clean) {
      subscriptions = [];
      toExecute.unshift(function removePackets(cb) {
        that._packets.remove({ client: client.id }, cb);
      });
    }

    subscriptions = subscriptions || [];

    async.parallel(toExecute, function(err) {
      var now = Date.now();
      done(err, subscriptions.reduce(function(obj, sub) {
        // mongodb TTL is not precise
        if (sub.added.getTime() + that.options.ttl.subscriptions > now) {
          obj[sub.topic] = {
            qos: sub.qos
          };
        }
        return obj;
      }, {}));
    });
  });
};

MongoPersistence.prototype.storeRetained = function(packet, cb) {

  this._retained.findAndModify(
    { topic: packet.topic },
    [],
    packet,
    {
      upsert: true,
      new: true
    },
    function(err, result){
      if(!err) {
        packet._id = result._id;
      }
      if(cb) {
        return cb(err);
      }
    });

};

MongoPersistence.prototype.lookupRetained = function(pattern, cb) {

  var regexp = new RegExp(pattern.replace(/(#|\+)/, ".+"));
  var stream = this._retained.find({ topic: { $regex: regexp } }).stream();
  var matched = [];
  var qlobber = new Qlobber({ separator: '/' });
  qlobber.add(pattern, true);

  stream.on("error", cb);

  stream.on("end", function() {
    cb(null, matched);
  });

  stream.on("data", function(data) {
    if (qlobber.match(data.topic).length > 0) {
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
  this._packets.insert({
    client: client,
    packet: packet
  }, cb);
};

MongoPersistence.prototype.streamOfflinePackets = function(client, cb) {
  if (client.clean) {
    return;
  }

  var stream = this._packets.find({ client: client.id }).stream();
  var that = this;

  stream.on("error", cb);

  stream.on("data", function(data) {
    that._packets.remove({ _id: data._id }, function() {

      data.packet.payload = data.packet.payload.buffer;

      cb(null, data.packet);
    });
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
