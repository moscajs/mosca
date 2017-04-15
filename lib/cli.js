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

var pkg = require("../package");
var commander = require("commander");
var path = require("path");
var Authorizer = require("./authorizer");
var fs = require("fs");
var steed = require("steed")();
var Server = require("./server");
var persistence = require("./persistence");

/**
 * Load a new Authorizer
 *
 * @api private
 * @param {commander.Command} program the specified options from the command line
 * @param {Function} cb The callback that will invoked with the authorizer
 */
function loadAuthorizer(program, cb) {
  if (program.credentials) {
    fs.readFile(program.credentials, function(err, data) {
      if (err) {
        cb(err);
        return;
      }

      var authorizer = new Authorizer();

      try {
        authorizer.users = JSON.parse(data);
        cb(null, authorizer);
      } catch(err) {
        cb(err);
      }
    });
  } else {
    cb(null, null);
  }
}

/**
 * Start a new server
 *
 * @api private
 * @param {Function} pre the callback to call before doing anything
 * @param {commander.Command} program the parsed argument
 * @param {Function} callback the callback to call when finished
 */
function start(program, callback) {
  return function() {

    var server = null;

    var defopts = {
      backend: {},
      logger: {},
      stats: true,
      persistence: {
        factory: persistence.Memory
      }
    };

    var opts = defopts;

    opts.port = program.port;
    opts.host = program.host;

    if (program.parentPort || program.parentHost) {
      opts.backend.type = "mqtt";
      opts.backend.port = 1883;
    }

    if (program.parentHost) {
      opts.backend.host = program.parentHost;
    }

    if (program.parentPort) {
      opts.backend.port = program.parentPort;
    }

    opts.backend.prefix = program.parentPrefix;

    if (program.disableStats) {
      opts.stats = false;
    }

    opts.id = program.brokerId;

    if (program.cert || program.key) {
      if (program.cert && program.key) {
        opts.secure = {};
        opts.secure.port = program.securePort;
        opts.secure.keyPath = program.key;
        opts.secure.certPath = program.cert;
        opts.allowNonSecure = program.nonSecure;
      }
      else {
        throw new Error("Must supply both private key and signed certificate to create secure mosca server");
      }
    }

    if (program.httpPort || program.onlyHttp) {
      opts.http = {
        port: program.httpPort,
        static: program.httpStatic,
        bundle: program.httpBundle
      };
      opts.onlyHttp = program.onlyHttp;
    }

    if (program.httpsPort) {
      if(program.cert && program.key) {
        opts.https = {
          port:   program.httpsPort,
          static: program.httpsStatic,
          bundle: program.httpsBundle
        };
      } else {
        throw new Error("Must supply both private key and signed certificate to create secure mosca websocket server");
      }
    }

    if (program.config) {
      opts = require(path.resolve(program.config));

      // merge any unspecified options into opts from defaults (defopts)
      Object.keys(defopts).forEach(function(key) {
        if(typeof opts[key] === 'undefined') {
          opts[key] = defopts[key];
        }
      });
    }

    if (program.verbose) {
      opts.logger.level = 30;
    } else if (program.veryVerbose) {
      opts.logger.level = 20;
    }

    if (program.db) {
      opts.persistence.path = program.db;
      opts.persistence.factory = persistence.LevelUp;
    }

    var setupAuthorizer = function(cb) {
      process.on("SIGHUP", setupAuthorizer);
      server.on("closed", function() {
        process.removeListener("SIGHUP", setupAuthorizer);
      });

      loadAuthorizer(program, function(err, authorizer) {
        if (err) {
          callback(err);
          return;
        }

        if (authorizer) {
          server.authenticate = authorizer.authenticate;
          server.authorizeSubscribe = authorizer.authorizeSubscribe;
          server.authorizePublish = authorizer.authorizePublish;
        }

        if (cb) {
          cb(null, server);
        }
      });

      return false;
    };

    steed.series([
      function(cb) {
        server = new Server(opts);
        server.on("ready", cb);
      },
      setupAuthorizer
    ], function(err, results) {
      callback(err, results[1]);
    });

    return server;
  };
}

/**
 * The basic command line interface of Mosca.
 *
 * @api private
 */
module.exports = function cli(argv, callback) {

  argv = argv || [];

  var program = new commander.Command();
  var server = null;
  var runned = false;

  callback = callback || function() {};

  program
    .version(pkg.version)
    .option("-p, --port <n>", "the port to listen to", parseInt)
    .option("--host <IP>", "the host to listen to")
    .option("--parent-port <n>", "the parent port to connect to", parseInt)
    .option("--parent-host <s>", "the parent host to connect to")
    .option("--parent-prefix <s>", "the prefix to use in the parent broker")
    .option("--credentials <file>", "the file containing the credentials", null, "./credentials.json")
    .option("--authorize-publish <pattern>", "the pattern for publishing to topics for the added user")
    .option("--authorize-subscribe <pattern>", "the pattern for subscribing to topics for the added user")
    .option("--key <file>", "the server's private key")
    .option("--cert <file>", "the certificate issued to the server")
    .option("--secure-port <n>", "the TLS port to listen to", parseInt)
    .option("--non-secure", "start both a secure and non-secure server")
    .option("--http-port <n>", "start an mqtt-over-websocket server on the specified port", parseInt)
    .option("--https-port <n>", "start an mqtt-over-secure-websocket server on the specified port", parseInt)
    .option("--http-static <directory>", "serve some static files alongside the websocket client")
    .option("--https-static <directory>", "serve some static files alongside the secure websocket client")
    .option("--http-bundle", "serve a MQTT.js-based client at /mqtt.js on HTTP")
    .option("--https-bundle", "serve a MQTT.js-based client at /mqtt.js on HTTPS")
    .option("--only-http", "start only an mqtt-over-websocket server")
    .option("--disable-stats", "disable the publishing of stats under $SYS", null, true)
    .option("--broker-id <id>", "the id of the broker in the $SYS/<id> namespace")
    .option("-c, --config <c>", "the config file to use (override every other option)")
    .option("-d, --db <path>", "the path were to store the database")
    .option("-v, --verbose", "set the log level to INFO")
    .option("--very-verbose", "set the log level to DEBUG");

  function loadAuthorizerAndSave(cb) {
    runned = true;

    loadAuthorizer(program, function (err, authorizer) {
      if (err) {
        authorizer = new Authorizer();
      }

      cb(null, authorizer, function(err) {
        if (err) {
          callback(err);
          return;
        }
        fs.writeFile(program.credentials, JSON.stringify(authorizer.users, null, 2), callback);
      });
    });
  }

  function adduser(username, password) {
    runned = true;
    loadAuthorizerAndSave(function(err, authorizer, done) {
      authorizer.addUser(username, password, program.authorizePublish,
                         program.authorizeSubscribe, done);
    });
  }

  function rmuser(username) {
    runned = true;
    loadAuthorizerAndSave(function(err, authorizer, done) {
      authorizer.rmUser(username, done);
    });
  }

  program.
    command("adduser <user> <pass>").
    description("Add a user to the given credentials file").
    action(adduser);

  program.
    command("rmuser <user>").
    description("Removes a user from the given credentials file").
    action(rmuser);

  var doStart = start(program, callback);

  program.
    command("start").
    description("start the server (optional)").
    action(doStart);

  program.parse(argv);

  if (!runned) {
    return doStart();
  }
};
