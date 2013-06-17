
var LevelUpPersistance = require("./levelup");
var util = require("util");
var MemDOWN = require("memdown");
var factory = function (location) { return new MemDOWN(location) };

function MemoryPersistance() {
  LevelUpPersistance.call(this, "RAM", { db: factory });
}

util.inherits(MemoryPersistance, LevelUpPersistance);

module.exports = MemoryPersistance;
