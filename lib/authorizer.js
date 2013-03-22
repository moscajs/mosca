"use strict";

var hasher = require("./hasher");

/**
 * mosca.Authorizer's responsibility is to give an implementation
 * of mosca.Server callback of authorizations, against a JSON file.
 *
 * @param {Object} users The user hash, as created by this class
 *  (optional)
 * @api public
 */
function Authorizer(users) {
  this.users = users || {};
}
module.exports = Authorizer;

/**
 * It returns the authenticate function to plug into mosca.Server.
 *
 * @api public
 */
Authorizer.prototype.__defineGetter__("authenticate", function() {
  var that = this;
  return function (client, user, pass, cb) {
    that._authenticate(client, user, pass, cb);
  };
});

/**
 * The real authentication function
 *
 * @api private
 */
Authorizer.prototype._authenticate = function (client, user, pass, cb) {
  
  if (!this.users[user]) {
    cb(null, false);
    return;
  }

  user = this.users[user];

  hasher({ password: pass, salt: user.salt }, function (err, pass, salt, hash) {
    if (err) {
      cb(err);
      return;
    }

    var success = (user.hash === hash);
    cb(null, success);
  });
};

/**
 * An utility function to add an user.
 *
 * @api public
 * @param {String} user The username
 * @param {String} pass The password
 * @param {Function} cb The callback that will be called after the
 *   insertion.
 */
Authorizer.prototype.addUser = function (user, pass, cb) {
  var that = this;
  hasher({ password: pass }, function (err, pass, salt, hash) {
    if (!err) {
      that.users[user] = {
        salt: salt,
        hash: hash
      };
    }
    cb(err);
  });
  return this;
};


/**
 * An utility function to delete a user.
 *
 * @api public
 * @param {String} user The username
 * @param {String} pass The password
 * @param {Function} cb The callback that will be called after the
 *   deletion.
 */
Authorizer.prototype.rmUser = function (user, cb) {
  delete this.users[user];
  cb();
  return this;
};
