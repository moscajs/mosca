
var LevelUpPersistance = require("./levelup");
var util = require("util");
var MemDOWN = require("memdown");
var factory = function (location) { return new MemDOWN(location); };

function MemoryPersistance(options) {
  if (!(this instanceof MemoryPersistance)) {
    return new MemoryPersistance(path, options);
  }

  options = options || {};
  options.db = factory;
  LevelUpPersistance.call(this, "RAM", options);
}

util.inherits(MemoryPersistance, LevelUpPersistance);

module.exports = MemoryPersistance;
