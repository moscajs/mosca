var async = require("async");
var tmp = require('tmp');
var fs = require("fs");
var mqtt = require("mqtt");

describe("mosca.cli", function() {

  var server = null,
    oldDebug = null,
    parentServer = null,
    args = null;

  beforeEach(function(done) {
    args = ["node", "mosca"];
    oldDebug = process.env.DEBUG;
    parentServer = new mosca.Server({
      port: 3833
    }, done);
  });

  afterEach(function(done) {
    process.env.DEBUG = oldDebug;

    async.parallel([

      function(cb) {
        if (server) {
          server.close(cb);
        } else {
          cb();
        }
      },

      function(cb) {
        parentServer.close(cb);
      }
    ], function() {
      done();
    });
  });

  it("must be a function", function() {
    expect(mosca.cli).to.be.a("function");
  });

  it("should start a mosca.Server", function(done) {
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(server).to.be.instanceOf(mosca.Server);
      done();
    });
  });

  it("should support a verbose option", function(done) {
    args.push("-v");
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(process.env.DEBUG).to.be.equal("mosca");
      done();
    });
  });

  it("should support a very verbose option", function(done) {
    args.push("--very-verbose");
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(process.env.DEBUG).to.be.equal("mosca,ascoltatori:*");
      done();
    });
  });

  it("should support a port flag", function() {
    args.push("-p");
    args.push("2883");
    server = mosca.cli(args);
    expect(server.opts.port).to.eql(2883);
  });

  it("should support a port flag (bis)", function() {
    args.push("--port");
    args.push("2883");
    server = mosca.cli(args);
    expect(server.opts.port).to.eql(2883);
  });

  it("should support a parent port", function(done) {
    args.push("--parent-port");
    args.push("3833");
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(server.opts.backend.type).to.eql("mqtt");
      expect(server.opts.backend.port).to.eql(3833);
      done();
    });
  });

  it("should support a parent host", function(done) {
    args.push("--parent-host");
    args.push("localhost");
    args.push("--parent-port");
    args.push("3833");
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(server.opts.backend.type).to.eql("mqtt");
      expect(server.opts.backend.host).to.eql("localhost");
      done();
    });
  });

  it("should support a parent prefix", function(done) {
    args.push("--parent-port");
    args.push("3833");
    args.push("--parent-prefix");
    args.push("/ahaha");
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(server.opts.backend.prefix).to.eql("/ahaha");
      done();
    });
  });

  it("should support a config option", function(done) {
    args.push("--config");
    args.push("test/sample_config.js");
    server = mosca.cli(args);
    server.on("ready", function() {
      expect(server.opts).to.eql(require("./sample_config"));
      done();
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
        server = mosca.cli(args);
        server.on("ready", cb);
      },
      function(cb) {
        var options = { username: "test", password: "test" };
        var client = mqtt.createClient(1883, "localhost", options);
        cb = cb.bind(null, null, client);
        client.on("connect", cb);
      },
      function(client, cb) {
        client.on("close", cb);
        client.end();
      }
    ], function(err) {
      if(err) {
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
        server = mosca.cli(args);
        server.on("ready", cb);
      },
      function(cb) {
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
});
