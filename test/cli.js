var steed = require("steed");
var tmp = require('tmp');
var fs = require("fs");
var mqtt = require("mqtt");
var os = require("os");

var SECURE_KEY = __dirname + '/secure/tls-key.pem';
var SECURE_CERT = __dirname + '/secure/tls-cert.pem';

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
    var count = 0;
    steed.each(servers, function(s, cb) {
      count++;
      s.close(cb);
    }, function() {
      done();
    });
  });

  var startServer = function(done, callback) {
    return mosca.cli(args, function(err, server) {
      if (server) {
        servers.unshift(server);
        callback(server);
      }
      setImmediate(done.bind(null, err));
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
      expect(server.opts).to.have.property("port", 2883);
      expect(server.opts).to.have.deep.property("backend.port", 3833);
    });
  });

  it("should support a config option with an absolute path", function(done) {
    args.push("-c");
    args.push(process.cwd() + "/test/sample_config.js");
    startServer(done, function(server) {
      expect(server.opts).to.have.property("port", 2883);
      expect(server.opts).to.have.deep.property("backend.port", 3833);
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
    steed.waterfall([
      function(cb) {
        mosca.cli(args, cb);
      },
      function(server, cb) {
        servers.unshift(server);

        var options = { username: "test", password: "test", port: 1883 };
        var client = mqtt.connect(options);
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
    steed.waterfall([
      function(cb) {
        mosca.cli(args, cb);
      },
      function(server, cb) {
        servers.unshift(server);
        var options = { port: 1883, username: "bad", password: "bad" };
        var client = mqtt.connect(options);
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

  it("should reload the current config if killed with SIGHUP on a Linux-based OS", function(done) {

    if(os.platform() === "win32") return done();

    args.push("adduser");
    args.push("myuser");
    args.push("mypass");
    args.push("--credentials");

    var cloned = null;

    steed.waterfall([
      function(cb) {
        tmp.file(cb);
      },
      function(path, fd, ignore, cb) {
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
        var options = { port: 1883, username: "myuser", password: "mypass" };
        var client = mqtt.connect(options);
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

  it("should create a memory persistence object", function(done) {
    var s = startServer(done, function(server) {
      expect(server.persistence).to.be.instanceOf(mosca.persistence.Memory);
    });
  });

  it("should create a leveldb with the --db flag", function(done) {

    tmp.dir(function (err, path, fd) {
      if (err) {
        done(err);
        return;
      }

      args.push("--db");
      args.push(path);

      startServer(done, function(server) {
        expect(server.persistence).to.be.instanceOf(mosca.persistence.LevelUp);
        expect(server.persistence.options.path).to.eql(path);
      });
    });
  });

  describe("with --key and --cert", function() {

    beforeEach(function() {
      args.push("--key");
      args.push(SECURE_KEY);
      args.push("--cert");
      args.push(SECURE_CERT);
    });

    it("should pass key and cert to the server", function(done) {
      startServer(done, function(server) {
        expect(server.opts.secure.keyPath).to.eql(SECURE_KEY);
        expect(server.opts.secure.certPath).to.eql(SECURE_CERT);
      });
    });

    it("should support the --secure-port flag", function(done) {
      var port = nextPort();
      args.push("--secure-port");
      args.push(port);
      startServer(done, function(server) {
        expect(server.opts.secure.port).to.eql(port);
      });
    });

    it("should set the secure port by default at 8883", function(done) {
      startServer(done, function(server) {
        expect(server.opts.secure.port).to.eql(8883);
      });
    });

    it("should pass the --non-secure flag to the server", function(done) {
      args.push("--non-secure");
      startServer(done, function(server) {
        expect(server.opts.allowNonSecure).to.eql(true);
      });
    });

    it("should allow to set the https port", function(done) {

      args.push("--https-port");
      args.push("3000");
      startServer(done, function(server) {
        expect(server.opts.https.port).to.eql(3000);
      });
    });

    it("should serve a HTTPS static directory", function(done) {
      args.push("--https-port");
      args.push("3000");
      args.push("--https-static");
      args.push("/path/to/nowhere");
      startServer(done, function(server) {
        expect(server.opts.https.static).to.eql("/path/to/nowhere");
      });
    });

    it("should serve a HTTPS browserify bundle", function(done) {
      args.push("--https-port");
      args.push("3000");
      args.push("--https-bundle");
      startServer(done, function(server) {
        expect(server.opts.https.bundle).to.eql(true);
      });
    });

  });

  it("should allow to set the http port", function(done) {
    args.push("--http-port");
    args.push("3000");
    startServer(done, function(server) {
      expect(server.opts.http.port).to.eql(3000);
    });
  });

  it("should allow to limit the server only to http", function(done) {
    args.push("--http-port");
    args.push("3000");
    args.push("--only-http");
    startServer(done, function(server) {
      expect(server.opts.http.port).to.eql(3000);
    });
  });

  it("should serve a HTTP static directory", function(done) {
    args.push("--http-port");
    args.push("3000");
    args.push("--http-static");
    args.push("/path/to/nowhere");
    startServer(done, function(server) {
      expect(server.opts.http.static).to.eql("/path/to/nowhere");
    });
  });

  it("should serve a HTTP browserify bundle", function(done) {
    args.push("--http-port");
    args.push("3000");
    args.push("--http-bundle");
    startServer(done, function(server) {
      expect(server.opts.http.bundle).to.eql(true);
    });
  });

  it("should have stats enabled by default", function(done) {
    var s = startServer(done, function(server) {
      expect(server.opts.stats).to.equal(true);
    });
  });

  it("should allow to disable stats", function(done) {
    args.push("--disable-stats");
    var s = startServer(done, function(server) {
      expect(server.opts.stats).to.equal(false);
    });
  });

  it("should allow to specify a broker id", function(done) {
    args.push("--broker-id");
    args.push("44cats");
    var s = startServer(done, function(server) {
      expect(server.id).to.equal("44cats");
    });
  });

  it("should specify an interface to bind to", function(done) {
    args.push("--host");
    args.push("127.0.0.1");
    startServer(done, function(server) {
      expect(server.opts.host).to.eql("127.0.0.1");
    });
  });
});
