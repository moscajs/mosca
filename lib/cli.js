var pkg = require("../package");
var commander = require("commander");
var path = require("path");
var Authorizer = require("./authorizer");
var fs = require("fs");

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
    .option("--parent-port <n>", "the parent port to connect to", parseInt)
    .option("--parent-host <s>", "the parent host to connect to")
    .option("--parent-prefix <s>", "the prefix to use in the parent broker")
    .option("--credentials <file>", "the file containing the credentials", null, "./credentials.json")
    .option("-c, --config <c>", "the config file to use (override every other option)")
    .option("-v, --verbose", "equal to DEBUG=mosca")
    .option("--very-verbose", "equal to DEBUG=mosca,ascoltatori:*");

  var setupVerbose = function() {
    runned = true;
    if (program.veryVerbose) {
      process.env.DEBUG = "mosca,ascoltatori:*";
    } else if (program.verbose) {
      process.env.DEBUG = "mosca";
    }
  };

  var loadAuthorizer = function(cb) {
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
  };

  var start = function() {
    setupVerbose();

    // this MUST be done after changing the DEBUG env
    var Server = require("./server");

    var opts = {
      backend: {}
    };
    opts.port = program.port;

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

    if (program.config) {
      opts = require(path.join(process.cwd(), program.config));
    }

    server = new Server(opts);

    var setupAuthorizer = function() {
      process.on("SIGHUP", setupAuthorizer);
      server.on("closed", function() {
        process.removeListener("SIGHUP", setupAuthorizer);
      });

      loadAuthorizer(function(err, authorizer) {
        if (err) {
          callback(err);
          return;
        }

        if (authorizer) {
          server.authenticate = authorizer.authenticate;
          server.authorizeSubscribe = authorizer.authorizeSubscribe;
          server.authorizePublish = authorizer.authorizePublish;
        }

        callback(null, server);
      });

      return false;
    };

    setupAuthorizer();

    return server;
  };

  var adduser = function (username, password) {
    setupVerbose();

    loadAuthorizer(function (err, authorizer) {
      if (err) {
        authorizer = new Authorizer();
      }

      authorizer.addUser(username, password, function() {
        fs.writeFile(program.credentials, JSON.stringify(authorizer.users), callback);
      });
    });
  };

  var rmuser = function (username, password) {
    setupVerbose();

    var authorizer = new Authorizer();
    try {
      authorizer.users = JSON.parse(fs.readFileSync(program.credentials));
    } catch (err) {
      // nothing to do
    }
    authorizer.rmUser(username, function() {
      fs.writeFileSync(program.credentials, JSON.stringify(authorizer.users));
      callback();
    });
  };

  program.
    command("adduser <user> <pass>").
    description("Add a user to the given credentials file").
    action(adduser);

  program.
    command("rmuser <user>").
    description("Removes a user from the given credentials file").
    action(rmuser);

  program.
    command("start").
    description("start the server (optional)").
    action(start);

  program.parse(argv);

  if (!runned) {
    start();
  }

  return server;
};
