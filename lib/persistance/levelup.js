
var levelup = require("levelup");
var sublevel = require("level-sublevel");
var AbstractPersistence = require("./abstract");
var util = require("util");
var range = require('level-range');

function LevelUpPersistance(path, options) {
  options = options || {};
  options.valueEncoding = "json";
  this.db = sublevel(levelup(path, options));
  this._retained = this.db.sublevel("retained");
  this._clientSubscriptions = this.db.sublevel("clientSubscriptions");
  this._subscriptions = this.db.sublevel("subscriptions");
  this._offlinePackets = this.db.sublevel("offlinePackets");
}

util.inherits(LevelUpPersistance, AbstractPersistence);

LevelUpPersistance.prototype.storeRetained = function(packet, cb) {
  this._retained.put(packet.topic, packet, cb);
};

LevelUpPersistance.prototype.lookupRetained = function(pattern, cb) {
  var stream = this._retained.createReadStream();
  var matched = [];
  var regexp = new RegExp(pattern.replace(/(#|\+)/, ".+"));

  stream.on("error", cb);

  stream.on("end", function() {
    cb(null, matched);
  });

  stream.on("data", function(data) {

    if (regexp.test(data.key)) {
      matched.push(data.value);
    }
  });
};

LevelUpPersistance.prototype.storeSubscriptions = function(client, done) {
  var that = this;
  if (!client.clean) {
    this._clientSubscriptions.put(client.id, client.subscriptions, done);
    Object.keys(client.subscriptions).forEach(function(key) {
      that._subscriptions.put(util.format("%s:%s", key, client.id), {
        client: client.id,
        topic: key,
        qos: client.subscriptions[key]
      });
    });
  } else if (done) {
    done();
  }
};

var nop = function() {};
LevelUpPersistance.prototype.lookupSubscriptions = function(client, done) {
  var that = this;
  this._clientSubscriptions.get(client.id, function(err, subscriptions) {
    if (subscriptions && client.clean) {
      that._clientSubscriptions.del(client.id, function() {
        that.streamOfflinePackets(client, nop, function() {
          Object.keys(subscriptions).forEach(function(key) {
            that._subscriptions.del(util.format("%s:%s", key, client.id));
          });

          if (done) {
            done(null, {});
          }
        });
      });
    } else {
      if (!subscriptions) {
        subscriptions = {};
      }

      if (done) {
        done(null, subscriptions);
      }
    }
  });
};

LevelUpPersistance.prototype.storeOfflinePacket = function(packet, done) {
  var that = this;
  var stream = range(that._subscriptions, '%s:', packet.topic);

  stream.on("data", function(data) {
    var sub = data.value;
    that._offlinePackets.put(util.format("%s:%s", sub.client, new Date()), packet);
  });

  if (done) {
    stream.on("error", done);
    stream.on("end", done);
  }
};

LevelUpPersistance.prototype.streamOfflinePackets = function(client, cb, done) {

  var that = this;
  var stream = range(that._offlinePackets, '%s:', client.id);
  stream.on("data", function(data) {
    var key = util.format("%s:%s", client.id, data.key);
    that._offlinePackets.del(key);

    if (!client.clean) {
      cb(null, data.value);
    }
  });

  if (cb) {
    stream.on("error", cb);
  }

  if (done) {
    stream.on("end", done);
  }
};

LevelUpPersistance.prototype.close = function(cb) {
  this.db.close(cb);
};

module.exports = LevelUpPersistance;
