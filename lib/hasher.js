/*
Copyright (c) 2013-2014 Matteo Collina, http://matteocollina.com

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

var crypto = require("crypto");
var async = require("async");

/**
 * Hash a password, using a hash and the pbkd2
 * crypto module.
 *
 * Options:
 *  - `password`, the password to hash.
 *  - `salt`, the salt to use, as a base64 string.
 *
 *  If the `password` is left undefined, a new
 *  10-bytes password will be generated, and converted
 *  to base64.
 *
 *  If the `salt` is left undefined, a new salt is generated.
 *
 *  The callback will be called with the following arguments:
 *   - the error, if something when wrong.
 *   - the password.
 *   - the salt, encoded in base64.
 *   - the hash, encoded in base64.
 *
 * @param {Object} opts The options (optional)
 * @param {Function} callback
 */
module.exports = function hasher() {

  var args = Array.prototype.slice.call(arguments, 0);
  var callback = args.pop();
  var opts = args.pop() || {};

  var queue = [];

  if (typeof opts.password !== 'string') {
    queue.push(genPass);
  }

  if (typeof opts.salt !== 'string') {
    queue.push(genSalt);
  } else {
    opts.salt = new Buffer(opts.salt, 'base64');
  }

  queue.push(genHash);

  queue = queue.map(function(f) {
    return async.apply(f, opts);
  });

  async.waterfall(queue, callback);
};

/**
 * Generates a new password
 *
 * @api private
 * @param {Object} opts The options (where the new password will be stored)
 * @param {Function} cb The callback
 */
function genPass(opts, cb) {
  // generate a 10-bytes password
  crypto.randomBytes(10, function(err, buffer) {
    if (buffer) {
      opts.password = buffer.toString("base64");
    }
    cb(err);
  });
}

/**
 * Generates a new salt
 *
 * @api private
 * @param {Object} opts The options (where the new password will be stored)
 * @param {Function} cb The callback
 */
function genSalt(opts, cb) {
  crypto.randomBytes(64, function(err, buf) {
    opts.salt = buf;
    cb(err);
  });
}

/**
 * Generates a new hash using the password and the salt
 *
 *  The callback will be called with the following arguments:
 *   - the error, if something when wrong.
 *   - the password.
 *   - the salt, encoded in base64.
 *   - the hash, encoded in base64.
 *
 * @api private
 * @param {Object} opts The options used to generate the hash (password & salt)
 * @param {Function} cb The callback
 */
function genHash(opts, cb) {
  crypto.pbkdf2(opts.password, opts.salt, 10000, 128, function(err, hash) {
    if (typeof hash === 'string') {
      hash = new Buffer(hash, 'binary');
    }

    cb(err, opts.password, opts.salt.toString("base64"), hash.toString("base64"));
  });
}
