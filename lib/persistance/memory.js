"use strict";

var LevelUpPersistance = require("./levelup");
var util = require("util");
var MemDOWN = require("memdown");
var factory = function (location) { return new MemDOWN(location); };

function MemoryPersistance(options) {
  if (!(this instanceof MemoryPersistance)) {
    return new MemoryPersistance(options);
  }

  options = options || {};
  options.db = factory;
  options.path = "RAM";
  LevelUpPersistance.call(this, options);
}

util.inherits(MemoryPersistance, LevelUpPersistance);

module.exports = MemoryPersistance;
