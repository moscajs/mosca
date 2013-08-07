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
 * @param {Object} options The options to create this persistance
 * @param {Function} callback Called when ready.
 */
function MemoryPersistence(options, callback) {
  if (!(this instanceof MemoryPersistence)) {
    return new MemoryPersistence(options, callback);
  }

  options = options || {};
  options.db = factory;
  options.path = "RAM";
  LevelUpPersistence.call(this, options, callback);
}

util.inherits(MemoryPersistence, LevelUpPersistence);

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = MemoryPersistence;
