
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
 * @param {Object} opts The options (optional)
 * @param {Function} callback
 */
module.exports = function hasher() {
  
  var args = Array.prototype.slice.call(arguments, 0);
  var callback = args.pop();
  var opts = args.pop() || {};

  async.waterfall([
    function (cb) {
      if (typeof opts.password !== 'string') {
        debug("missing password, generating");
        // generate a 10-bytes password
        crypto.randomBytes(10, function (err, buffer) {
          if (err) {
            cb(err);
          }
          cb(null, buffer.toString("base64"));
        });
        return;
      }
      cb(null, opts.password);
    },
    function (password, cb) {
      if (typeof opts.salt !== 'string') {
        debug("missing salt, generating");
        crypto.randomBytes(64, function (err, buf) {
          cb(err, password, buf);
        });
        return;
      }

      cb(null, password, new Buffer(opts.salt, 'base64'));
    },
    function (password, salt, cb) {
      debug("hashing password & salt");
      crypto.pbkdf2(password, salt, 10000, 64, function (err, hash) {

        debug("hashing completed");

        if (typeof hash === 'string') {
          hash = new Buffer(hash);
        }

        cb(err, password, salt.toString("base64"), hash.toString("base64"));
      });
    }
  ], callback);
};
