/*
Copyright (c) 2013-2016 Matteo Collina, http://matteocollina.com

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/
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

MemoryPersistence.prototype.close = function(cb) {

  MemDOWN.clearGlobalStore();

  this._streams.forEach(function(stream) {
    stream.destroy();
  });
  this.db.close(cb);
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = MemoryPersistence;
