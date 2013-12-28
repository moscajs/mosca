"use strict";

var async = require("async");
var EventEmitter = require("events").EventEmitter;

module.exports = function(create, buildOpts) {
  var _opts;

  if (typeof buildOpts !== "function") {
    _opts = buildOpts;
    buildOpts = function(cb) {
      cb(null, _opts); 
    };
  }

  beforeEach(function(done) {
    var that = this;
    buildOpts(function(err, opts) {
      if (err) {
        return done(err);
      }

      create(opts, function(err, result) {
        if (err) {
          return done(err);
        }

        that.instance = result;
        that.opts = opts;
        done();
      });
    });
  });

  afterEach(function(done) {
    var that = this;
    setTimeout(function() {
      that.instance.close(done);
      that.instance = null;
    }, 1);
  });

  describe("retained messages", function() {

    it("should store retain messages", function(done) {
      var packet = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42,
        retain: true
      };
      this.instance.storeRetained(packet, done);
    });

    it("should lookup retain messages and not matching", function(done) {
      this.instance.lookupRetained("hello", function(err, results) {
        expect(results).to.eql([]);
        done();
      });
    });

    it("should match and load a retained message", function(done) {
      var packet = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42,
        retain: true
      };

      var instance = this.instance;

      async.series([
        function(cb) {
          instance.storeRetained(packet, cb);
        },
        function(cb) {
          instance.lookupRetained("hello", function(err, results) {
            expect(results[0]).to.eql(packet);
            cb();
          });
        }
      ], done);
    });

    it("should match and load a single retained message", function(done) {

      var packetMessageId = 0;

      var getPacket = function(){

        packetMessageId++;

        return {
          topic: "hello",
          qos: 0,
          payload: new Buffer("world"),
          messageId: packetMessageId,
          retain: true
        };
      };

      var instance = this.instance;

      async.parallel([
        function(cb) { instance.storeRetained(getPacket(), cb); },
        function(cb) { instance.storeRetained(getPacket(), cb); },
        function(cb) { instance.storeRetained(getPacket(), cb); },
        function(cb) { instance.storeRetained(getPacket(), cb); },
        function(cb) { instance.storeRetained(getPacket(), cb); }
      ], function(err, results) {
          instance.lookupRetained("hello", function(err, results) {
            expect(results.length).to.be.eql(1);
            done();
          });
      });
    });

    it("should overwrite a retained message", function(done) {
      var packet = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42,
        retain: true
      };

      var packet2 = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("matteo"),
        messageId: 43,
        retain: true
      };

      var instance = this.instance;

      async.series([
        instance.storeRetained.bind(instance, packet),
        instance.storeRetained.bind(instance, packet2),
        function(cb) {
          instance.lookupRetained("hello", function(err, results) {
            expect(results).to.have.property("length", 1);
            expect(results[0]).to.eql(packet2);
            cb();
          });
        }
      ], done);
    });

    it("should match and load with a pattern", function(done) {
      var packet1 = {
        topic: "hello/1",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42,
        retain: true
      };

      var packet2 = {
        topic: "hello/2",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 43,
        retain: true
      };

      var instance = this.instance;

      async.series([
        function(cb) {
          instance.storeRetained(packet1, cb);
        },
        function(cb) {
          instance.storeRetained(packet2, cb);
        },
        function(cb) {
          instance.lookupRetained("hello/#", function(err, results) {
            expect(results).to.eql([packet1, packet2]);
            cb();
          });
        }
      ], done);
    });

    it("should wire itself up to storePacket method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      var packet1 = {
        topic: "hello/1",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42,
        retain: true
      };

      instance.wire(server);
      server.storePacket(packet1, function() {
        instance.lookupRetained(packet1.topic, function(err, results) {
          expect(results).to.eql([packet1]);
          done();
        });
      });
    });

    it("should wire itself up to the forwardRetained method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      var packet1 = {
        topic: "hello/1",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42,
        retain: true
      };

      var client = { 
        logger: globalLogger,
        forward: function(topic, payload, options, pattern) {
          expect(topic).to.eql(packet1.topic);
          expect(payload).to.eql(packet1.payload);
          expect(options).to.eql(packet1);
          expect(pattern).to.eql("hello/#");
          done();
        }
      };

      instance.wire(server);

      instance.storeRetained(packet1, function() {
        server.forwardRetained("hello/#", client);
      });
    });
  });

  describe("subscriptions", function() {

    it("should store the an offline client subscriptions", function(done) {
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };
      this.instance.storeSubscriptions(client, done);
    });

    it("should load the offline client subscriptions", function(done) {
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };
      this.instance.lookupSubscriptions(client, function(err, results) {
        expect(results).to.eql({});
        done();
      });
    });

    it("should store and load the an offline client subscriptions", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        instance.lookupSubscriptions(client, function(err, results) {
          expect(results).to.eql(client.subscriptions);
          done();
        });
      });
    });

    it("should not store the subscriptions of clean client", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: true,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        client.clean = false;
        instance.lookupSubscriptions(client, function(err, results) {
          expect(results).to.eql({});
          done();
        });
      });
    });

    it("should remove the subscriptions after lookup", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        instance.lookupSubscriptions(client, function() {
          instance.lookupSubscriptions(client, function(err, results) {
            expect(results).to.eql({});
            done();
          });
        });
      });
    });

    it("should allow a clean client to connect", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: true,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.lookupSubscriptions(client, function(err, results) {
        expect(results).to.eql({});
        done();
      });
    });

    it("should load an empty subscriptions object for a clean client", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        client.clean = true;
        instance.lookupSubscriptions(client, function(err, results) {
          expect(results).to.eql({});
          done();
        });
      });
    });

    it("should clean up the subscription store if a clean client connects", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        client.clean = true;
        instance.lookupSubscriptions(client, function(err, results) {
          client.clean = false;
          instance.lookupSubscriptions(client, function(err, results) {
            expect(results).to.eql({});
            done();
          });
        });
      });
    });

    it("should wire itself up to the restoreClientSubscriptions method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;

      var client = { 
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        },
        handleAuthorizeSubscribe: function(err, success, subscription, callback) {
          expect(success).to.eql(true);
          expect(subscription).to.eql({ topic: "hello", qos: 1 });
          expect(callback).to.be.a("function");
          done();
        }
      };

      instance.wire(server);

      instance.storeSubscriptions(client, function() {
        server.restoreClientSubscriptions(client);
      });
    });

    it("should wire itself up to the persistClient method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;

      var client = { 
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.wire(server);
      server.persistClient(client, function() {
        instance.lookupSubscriptions(client, function(err, results) {
          expect(results).to.eql(client.subscriptions);
          done();
        });
      });
    });

    it("should clean up the subscription store after a TTL", function(done) {
      var instance = this.instance;
      var that = this;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        setTimeout(function() {
          instance.lookupSubscriptions(client, function(err, results) {
            expect(results).to.eql({});
            done();
          });
        }, that.opts.ttl.checkFrequency + 500);
      });
    });

    it("should not store a QoS 0 subscription", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 0
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        instance.lookupSubscriptions(client, function(err, results) {
          expect(results).to.eql({});
          done();
        });
      });
    });
  });

  describe("offline packets", function() {
    var client = { 
      id: "my client id - 42",
      clean: false,
      logger: globalLogger,
      subscriptions: {
        hello: {
          qos: 1
        }
      }
    };

    var packet = {
      topic: "hello",
      qos: 0,
      payload: new Buffer("world"),
      messageId: 42
    };

    beforeEach(function(done) {
      this.instance.storeSubscriptions(client, done);
    });

    it("should store an offline packet", function(done) {
      this.instance.storeOfflinePacket(packet, done);
    });

    it("should not stream any offline packet", function(done) {
      this.instance.streamOfflinePackets(client, function(err, packet) {
        done(new Error("this should never be called"));
      });
      done();
    });

    it("should store and stream an offline packet", function(done) {
      var instance = this.instance;
      instance.storeOfflinePacket(packet, function() {
        instance.streamOfflinePackets(client, function(err, p) {
          expect(p).to.eql(packet);
          done();
        });
      });
    });

    it("should support multiple subscription command", function(done) {
      var instance = this.instance;
      instance.storeSubscriptions(client, function() {
        instance.storeOfflinePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            expect(p).to.eql(packet);
            done();
          });
        });
      });
    });

    it("should delete the offline packets once streamed", function(done) {
      var instance = this.instance;
      instance.storeOfflinePacket(packet, function() {
        instance.streamOfflinePackets(client, function(err, p) {
          instance.streamOfflinePackets(client, function(err, p2) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });
    });

    it("should clean up the offline packets store if a clean client connects", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeOfflinePacket(packet, function() {
        client.clean = true;
        instance.lookupSubscriptions(client, function(err, results) {
          client.clean = false;
          instance.streamOfflinePackets(client, function(err, p) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });
    });

    it("should not store any offline packet for a clean client", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: 1
        }
      };

      client.clean = true;
      instance.lookupSubscriptions(client, function(err, results) {
        instance.storeOfflinePacket(packet, function() {
          client.clean = false;
          instance.streamOfflinePackets(client, function(err, p) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });
    });

    it("should not store any offline packet for a client after lookup", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: 1
        }
      };

      instance.lookupSubscriptions(client, function(err, results) {
        instance.storeOfflinePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });
    });

    it("should not stream any offline packet to a clean client", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeOfflinePacket(packet, function() {
        client.clean = true;
        instance.streamOfflinePackets(client, function(err, p) {
          done(new Error("this should never be called"));
        });
        done();
      });
    });

    it("should wire itself up to the storePacket method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;

      instance.wire(server);
      server.storePacket(packet, function() {
        instance.streamOfflinePackets(client, function(err, p1) {
          expect(p1).to.eql(packet);
          done();
        });
      });
    });

    it("should wire itself up to the forwardOfflinePackets method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;

      instance.wire(server);

      client.forward = function(topic, payload, options, pattern) {
        expect(topic).to.eql(packet.topic);
        expect(payload).to.eql(packet.payload);
        expect(options).to.eql(packet);
        expect(pattern).to.eql("hello");
        done();
      };

      client.handleAuthorizeSubscribe = function(a, b, c, cb) { cb(); };

      instance.storeOfflinePacket(packet, function() {
        server.forwardOfflinePackets(client);
      });
    });
  });

  describe("offline packets pattern", function() {
    var client = { 
      id: "my client id - 42",
      clean: false,
      logger: globalLogger,
      subscriptions: {
        "hello/#": {
          qos: 1
        }
      }
    };

    var packet = {
      topic: "hello/42",
      qos: 0,
      payload: new Buffer("world"),
      messageId: 42
    };

    beforeEach(function(done) {
      this.instance.storeSubscriptions(client, done);
    });

    it("should store and stream an offline packet", function(done) {
      var instance = this.instance;
      instance.storeOfflinePacket(packet, function() {
        instance.streamOfflinePackets(client, function(err, p) {
          expect(p).to.eql(packet);
          done();
        });
      });
    });
  });

  describe("inflight packets", function() {
    var packet = {
      topic: "hello",
      qos: 0,
      payload: new Buffer("world"),
      messageId: 42
    };
    var client = { 
      id: "my client id - 42",
      clean: false,
      logger: globalLogger,
      subscriptions: {
        hello: {
          qos: 1
        }
      },
      inflight: {
        42: { packet: packet }
      }
    };

    it("should store one inflight packet", function(done) {
      this.instance.storeInflightPackets(client, done);
    });

    it("should store and stream an inflight packet", function(done) {
      var instance = this.instance;
      instance.storeInflightPackets(client, function() {
        instance.streamOfflinePackets(client, function(err, p) {
          expect(p).to.eql(packet);
          done();
        });
      });
    });

    it("should delete the offline packets once streamed", function(done) {
      var instance = this.instance;
      instance.storeInflightPackets(client, function() {
        instance.streamOfflinePackets(client, function(err, p) {
          instance.streamOfflinePackets(client, function(err, p2) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });
    });

    it("should wire itself up to the persistClient method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);

      server.persistClient(client, function() {
        instance.streamOfflinePackets(client, function(err, packet) {
          done();
        });
      });
    });
  });
};
