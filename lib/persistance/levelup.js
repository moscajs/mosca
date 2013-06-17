
var levelup = require("levelup");
var sublevel = require("level-sublevel");
var AbstractPersistence = require("./abstract");
var util = require("util");

function LevelUpPersistance(path, options) {
  options = options || {};
  options.valueEncoding = "json";
  this.db = sublevel(levelup(path, options));
  this._retained = this.db.sublevel("retained");
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

LevelUpPersistance.prototype.close = function(cb) {
  this.db.close(cb);
};

module.exports = LevelUpPersistance;
