
var LevelUpPersistance = require("./levelup");
var util = require("util");
var MemDOWN = require("memdown");
var factory = function (location) { return new MemDOWN(location); };

function MemoryPersistance(opts) {
  if (!(this instanceof MemoryPersistance)) {
    return new MemoryPersistance(path, options);
  }

  opts = opts || {};
  opts.db = factory;
  LevelUpPersistance.call(this, "RAM", opts);
}

util.inherits(MemoryPersistance, LevelUpPersistance);

module.exports = MemoryPersistance;
