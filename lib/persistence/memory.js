"use strict";

var LevelUpPersistence = require("./levelup");
var util = require("util");
var MemDOWN = require("memdown");
var factory = function (location) { return new MemDOWN(location); };

/**
 * A persistence based in memory that uses LevelUp with
 * MemDOWN.
 *
 * It exposes the same options of the LevelUpPersistence,
 * minus the `db`, which is set to MemDOWN for convenience.
 *
 * @api public
 */
function MemoryPersistence(options) {
  if (!(this instanceof MemoryPersistence)) {
    return new MemoryPersistence(options);
  }

  options = options || {};
  options.db = factory;
  options.path = "RAM";
  LevelUpPersistence.call(this, options);
}

util.inherits(MemoryPersistence, LevelUpPersistence);

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = MemoryPersistence;
