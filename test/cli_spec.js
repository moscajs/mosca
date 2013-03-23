var async = require("async");

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
    ], done);
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
});
