"use strict";

var LevelUpPersistance = require("./levelup");
var util = require("util");
var MemDOWN = require("memdown");
var factory = function (location) { return new MemDOWN(location); };

/**
 * A persistance based in memory that uses LevelUp with
 * MemDOWN.
 *
 * It exposes the same options of the LevelUpPersistance,
 * minus the `db`, which is set to MemDOWN for convenience.
 *
 * @api public
 */
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

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = MemoryPersistance;
