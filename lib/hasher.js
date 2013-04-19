var crypto = require("crypto");
var async = require("async");
var debug = require("debug")("hasher");

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
  debug("missing password, generating");
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
  debug("missing salt, generating");
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
  debug("hashing password & salt");
  crypto.pbkdf2(opts.password, opts.salt, 10000, 128, function(err, hash) {

    debug("hashing completed");

    if (typeof hash === 'string') {
      hash = new Buffer(hash, 'binary');
    }

    cb(err, opts.password, opts.salt.toString("base64"), hash.toString("base64"));
  });
}
