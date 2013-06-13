var async = require("async");
var tmp = require('tmp');
var fs = require("fs");
var mqtt = require("mqtt");

describe("mosca.cli", function() {

  var servers = null,
    oldDebug = null,
    args = null;

  beforeEach(function(done) {
    args = ["node", "mosca"];
    servers = [new mosca.Server({
      port: 3833
    }, done)];
  });

  afterEach(function(done) {
    async.parallel(servers.map(function(s) {
      return function(cb) {
        s.close(cb);
      };
    }), function() {
      done();
    });
  });

  var startServer = function(done, callback) {
    return mosca.cli(args, function(err, server) {
      if (server) {
        servers.unshift(server);
        callback(server);
      }
      done(err);
    });
  };

  it("must be a function", function() {
    expect(mosca.cli).to.be.a("function");
  });

  it("should start a mosca.Server", function(done) {
    startServer(done, function(server) {
      expect(server).to.be.instanceOf(mosca.Server);
    });
  });

  it("should create a bunyan logger", function(done) {
    args.push("-v");
    var s = startServer(done, function(server) {
      expect(server.logger).to.exist;
    });

    if (s.logger) {
      s.logger.streams.pop();
    }
  });

  it("should set the logging level to 40", function(done) {
    startServer(done, function(server) {
      expect(server.logger.level()).to.equal(40);
    });
  });

  it("should support a verbose option by setting the bunyan level to 30", function(done) {
    args.push("-v");
    var s = startServer(done, function(server) {
      expect(server.logger.level()).to.equal(30);
    });

    if (s.logger) {
      s.logger.streams.pop();
    }
  });

  it("should support a very verbose option by setting the bunyan level to 20", function(done) {
    args.push("--very-verbose");
    var s = startServer(done, function(server) {
      expect(server.logger.level()).to.equal(20);
    });

    if (s.logger) {
      s.logger.streams.pop();
    }
  });

  it("should support a port flag", function(done) {
    args.push("-p");
    args.push("2883");
    startServer(done, function(server) {
      expect(server.opts.port).to.eql(2883);
    });
  });

  it("should support a port flag (bis)", function(done) {
    args.push("--port");
    args.push("2883");
    startServer(done, function(server) {
      expect(server.opts.port).to.eql(2883);
    });
  });

  it("should support a parent port", function(done) {
    args.push("--parent-port");
    args.push("3833");
    startServer(done, function(server) {
      expect(server.opts.backend.type).to.eql("mqtt");
      expect(server.opts.backend.port).to.eql(3833);
    });
  });

  it("should support a parent host", function(done) {
    args.push("--parent-host");
    args.push("localhost");
    args.push("--parent-port");
    args.push("3833");
    startServer(done, function(server) {
      expect(server.opts.backend.type).to.eql("mqtt");
      expect(server.opts.backend.host).to.eql("localhost");
    });
  });

  it("should support a parent prefix", function(done) {
    args.push("--parent-port");
    args.push("3833");
    args.push("--parent-prefix");
    args.push("/ahaha");
    startServer(done, function(server) {
      expect(server.opts.backend.prefix).to.eql("/ahaha");
    });
  });

  it("should support a config option", function(done) {
    args.push("--config");
    args.push("test/sample_config.js");
    startServer(done, function(server) {
      expect(server.opts).to.eql(require("./sample_config"));
    });
  });

  it("should add an user to an authorization file", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--credentials");

    tmp.file(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push(path);
      mosca.cli(args, function () {
        var content = JSON.parse(fs.readFileSync(path));
        expect(content).to.have.property("myuser");
        done();
      });
    });
  });

  it("should add an user specifying the authorizePublish pattern", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--authorize-publish");
    args.push("hello/**/*");
    args.push("--credentials");

    tmp.file(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push(path);
      mosca.cli(args, function () {
        var content = JSON.parse(fs.readFileSync(path));
        expect(content.myuser).to.have.property("authorizePublish", "hello/**/*");
        done();
      });
    });
  });

  it("should add an user specifying the authorizeSubscribe pattern", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--authorize-subscribe");
    args.push("hello/**/*");
    args.push("--credentials");

    tmp.file(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push(path);
      mosca.cli(args, function () {
        var content = JSON.parse(fs.readFileSync(path));
        expect(content.myuser).to.have.property("authorizeSubscribe", "hello/**/*");
        done();
      });
    });
  });

  it("should remove an user from an authorization file", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--credentials");

    tmp.file(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push(path);
      var cloned = [].concat(args);
      cloned[2] = "rmuser";

      mosca.cli(args, function () {
        mosca.cli(cloned, function () {
          var content = JSON.parse(fs.readFileSync(path));
          expect(content).not.to.have.property("myuser");
          done();
        });
      });
    });
  });

  it("should support authorizing an authorized client", function(done) {
    args.push("--credentials");
    args.push("test/credentials.json");
    async.waterfall([
      function(cb) {
        mosca.cli(args, cb);
      },
      function(server, cb) {
        servers.unshift(server);

        var options = { username: "test", password: "test" };
        var client = mqtt.createClient(1883, "localhost", options);
        client.on("error", cb);
        client.on("connect", function() {
          cb(null, client);
        });
      },
      function(client, cb) {
        client.once("close", cb);
        client.end();
      }
    ], function(err) {
      if(err instanceof Error) {
        done(err);
        return;
      }
      done();
    });
  });

  it("should support negating an unauthorized client", function(done) {
    args.push("--credentials");
    args.push("test/credentials.json");
    async.waterfall([
      function(cb) {
        mosca.cli(args, cb);
      },
      function(server, cb) {
        servers.unshift(server);
        var options = { username: "bad", password: "bad" };
        var client = mqtt.createClient(1883, "localhost", options);
        client.on("error", cb);
        client.on("connect", function() {
          cb(null, client);
        });
      },
      function(client, cb) {
        client.once("close", cb);
        client.end();
      }
    ], function(err) {
      if(err) {
        done();
        return;
      }
      done(new Error("No error thrown"));
    });
  });

  it("should reload the config using if killed with SIGHUP", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--credentials");
    
    var cloned = null;

    async.waterfall([
      function(cb) {
        tmp.file(cb);
      },
      function(path, fd, cb) {
        args.push(path);
        cloned = [].concat(args);
        cloned[2] = "rmuser";

        mosca.cli(args, cb);
      },
      function(cb) {
        mosca.cli(["node", "mosca", "--credentials", cloned[cloned.length - 1]], cb);
      },
      function(server, cb) {
        servers.unshift(server);

        setTimeout(function() {
          mosca.cli(cloned, cb);
        }, 300);
      },
      function(cb) {
        process.kill(process.pid, 'SIGHUP');
        setTimeout(cb, 50);
      },
      function(cb) {
        var options = { username: "myuser", password: "mypass" };
        var client = mqtt.createClient(1883, "localhost", options);
        client.once("error", cb);
        client.once("connect", function() {
          client.once("close", cb);
          client.end();
        });
      }
    ], function(err) {
      if(err) {
        done();
        return;
      }
      done(new Error("should have errored"));
    });
  });

  it("should save the credentials.json as a formatted JSON when adding", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--credentials");

    tmp.file(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push(path);
      mosca.cli(args, function () {
        var content = fs.readFileSync(path);
        expect(JSON.stringify(JSON.parse(content), null, 2)).to.equal(content.toString('utf8'));
        done();
      });
    });
  });

  it("should save the credentials.json as a formatted JSON when removing", function(done) {
    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--credentials");

    tmp.file(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push(path);
      var cloned = [].concat(args);
      cloned[2] = "rmuser";
      cloned[3] = "anotheruser";

      mosca.cli(args, function () {
        mosca.cli(cloned, function () {
          var content = fs.readFileSync(path);
          expect(JSON.stringify(JSON.parse(content), null, 2)).to.equal(content.toString('utf8'));
          done();
        });
      });
    });
  });
});
