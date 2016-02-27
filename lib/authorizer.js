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

var hasher = require("pbkdf2-password")();
var minimatch = require("minimatch");
var defaultGlob = "**";

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
  return function(client, user, pass, cb) {
    that._authenticate(client, user, pass, cb);
  };
});

/**
 * It returns the authorizePublish function to plug into mosca.Server.
 *
 * @api public
 */
Authorizer.prototype.__defineGetter__("authorizePublish", function() {
  var that = this;
  return function(client, topic, payload, cb) {
    cb(null, minimatch(topic, that.users[client.user].authorizePublish || defaultGlob));
  };
});

/**
 * It returns the authorizeSubscribe function to plug into mosca.Server.
 *
 * @api public
 */
Authorizer.prototype.__defineGetter__("authorizeSubscribe", function() {
  var that = this;
  return function(client, topic, cb) {
    cb(null, minimatch(topic, that.users[client.user].authorizeSubscribe || defaultGlob));
  };
});

/**
 * The real authentication function
 *
 * @api private
 */
Authorizer.prototype._authenticate = function(client, user, pass, cb) {

  var missingUser = !user || !pass || !this.users[user];

  if (missingUser) {
    cb(null, false);
    return;
  }

  user = user.toString();

  client.user = user;
  user = this.users[user];

  hasher({
    password: pass.toString(),
    salt: user.salt
  }, function(err, pass, salt, hash) {
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
 * @param {String} authorizePublish The authorizePublish pattern
 *   (optional)
 * @param {String} authorizeSubscribe The authorizeSubscribe pattern
 *   (optional)
 * @param {Function} cb The callback that will be called after the
 *   insertion.
 */
Authorizer.prototype.addUser = function(user, pass, authorizePublish,
                                        authorizeSubscribe, cb) {
  var that = this;

  if (typeof authorizePublish === "function") {
    cb = authorizePublish;
    authorizePublish = null;
    authorizeSubscribe = null;
  } else if (typeof authorizeSubscribe == "function") {
    cb = authorizeSubscribe;
    authorizeSubscribe = null;
  }

  if (!authorizePublish) {
    authorizePublish = defaultGlob;
  }

  if (!authorizeSubscribe) {
    authorizeSubscribe = defaultGlob;
  }

  hasher({
    password: pass.toString()
  }, function(err, pass, salt, hash) {
    if (!err) {
      that.users[user] = {
        salt: salt,
        hash: hash,
        authorizePublish: authorizePublish,
        authorizeSubscribe: authorizeSubscribe
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
Authorizer.prototype.rmUser = function(user, cb) {
  delete this.users[user];
  cb();
  return this;
};
