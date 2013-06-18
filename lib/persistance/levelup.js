
var levelup = require("levelup");
var sublevel = require("level-sublevel");
var AbstractPersistence = require("./abstract");
var util = require("util");

function LevelUpPersistance(path, options) {
  options = options || {};
  options.valueEncoding = "json";
  this.db = sublevel(levelup(path, options));
  this._retained = this.db.sublevel("retained");
  this._subscriptions = this.db.sublevel("subscriptions");
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
  if (!client.clean) {
    this._subscriptions.put(client.id, client.subscriptions, done);
  } else if (done) {
    done();
  }
};

LevelUpPersistance.prototype.lookupSubscriptions = function(client, done) {
  var that = this;
  this._subscriptions.get(client.id, function(err, subscriptions) {
    if (subscriptions && client.clean) {
      that._subscriptions.del(client.id, function() {
        done(null, {});
      });
    } else if (!subscriptions) {
      subscriptions = {};
      done(null, subscriptions);
    } else {
      done(null, subscriptions);
    }
  });
};

LevelUpPersistance.prototype.close = function(cb) {
  this.db.close(cb);
};

module.exports = LevelUpPersistance;
