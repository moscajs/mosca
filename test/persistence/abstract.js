"use strict";

var steed = require("steed");
var pino = require("pino");
var EventEmitter = require("events").EventEmitter;

module.exports = function(create, buildOpts) {
  var _opts;

  if (typeof buildOpts !== "function") {
    _opts = buildOpts;
    buildOpts = function(cb) {
      cb(null, _opts);
    };
  }

  beforeEach(function build(done) {
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

  afterEach(function afterEachPersistenceAbstract(done) {
    var that = this;
    setImmediate(function() {
      that.instance.close(done);
      that.instance = null;
    });
  });

  describe("retained messages", function() {

    it("should store retain messages", function(done) {
      var packet = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "42",
        retain: true
      };
      this.instance.storeRetained(packet, done);
    });

    it("should lookup retain messages and not match", function(done) {
      this.instance.lookupRetained("hello", function(err, results) {
        expect(results).to.eql([]);
        done();
      });
    });

    it("should lookup invalid topic and not crash", function(done) {
      this.instance.lookupRetained("\\", function(err, results) {
        expect(results).to.eql([]);
        done();
      });
    });

    it("should match and load a retained message", function(done) {
      var packet = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "42",
        retain: true
      };

      var instance = this.instance;

      steed.series([
        function(cb) {
          instance.storeRetained(packet, cb);
        },
        function(cb) {
          instance.lookupRetained("hello", function(err, results) {
            expect(results[0].topic).to.eql(packet.topic);
            expect(results[0].payload).to.eql(packet.payload);
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
          messageId: "packetMessageId",
          retain: true
        };
      };

      var instance = this.instance;

      steed.parallel([
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
        messageId: "42",
        retain: true
      };

      var packet2 = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("matteo"),
        messageId: "43",
        retain: true
      };

      var instance = this.instance;

      steed.series([
        instance.storeRetained.bind(instance, packet),
        instance.storeRetained.bind(instance, packet2),
        function(cb) {
          instance.lookupRetained("hello", function(err, results) {
            expect(results).to.have.property("length", 1);
            expect(results[0].payload.toString()).to.equal("matteo");
            cb();
          });
        }
      ], done);
    });

    it("should remove a retained message if the payload is empty", function(done) {
      var packet = {
        topic: "hello",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "42",
        retain: true
      };

      var packet2 = {
        topic: "hello",
        qos: 0,
        payload: new Buffer(0),
        messageId: "43",
        retain: true
      };

      var instance = this.instance;

      steed.series([
        instance.storeRetained.bind(instance, packet),
        instance.storeRetained.bind(instance, packet2),
        function(cb) {
          instance.lookupRetained("hello", function(err, results) {
            expect(results).to.have.property("length", 0);
            cb();
          });
        }
      ], done);
    });

    it("should match and load with a 'some' pattern", function(done) {
      var packet1 = {
        topic: "hello/1",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "42",
        retain: true
      };

      var packet2 = {
        topic: "hello/2",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "43",
        retain: true
      };

      var instance = this.instance;

      steed.series([
        function(cb) {
          instance.storeRetained(packet1, cb);
        },
        function(cb) {
          instance.storeRetained(packet2, cb);
        },
        function(cb) {
          instance.lookupRetained("hello/#", function(err, results) {
            expect(results[0].topic).to.eql(packet1.topic);
            expect(results[0].payload.toString()).to.eql(packet1.payload.toString());
            expect(results[1].topic).to.eql(packet2.topic);
            expect(results[1].payload.toString()).to.eql(packet2.payload.toString());
            cb();
          });
        }
      ], done);
    });

    it("should match and load with a 'one' pattern", function(done) {
      var packet1 = {
        topic: "hello/1",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "42",
        retain: true
      };

      var packet2 = {
        topic: "hello/2",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "43",
        retain: true
      };

      var instance = this.instance;

      steed.series([
        function(cb) {
          instance.storeRetained(packet1, cb);
        },
        function(cb) {
          instance.storeRetained(packet2, cb);
        },
        function(cb) {
          instance.lookupRetained("hello/+", function(err, results) {
            expect(results[0].topic).to.eql(packet1.topic);
            expect(results[0].payload.toString()).to.eql(packet1.payload.toString());
            expect(results[1].topic).to.eql(packet2.topic);
            expect(results[1].payload.toString()).to.eql(packet2.payload.toString());
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
        messageId: "42",
        retain: true
      };

      instance.wire(server);
      server.storePacket(packet1, function() {
        instance.lookupRetained(packet1.topic, function(err, results) {
          expect(results[0].topic).to.eql(packet1.topic);
          expect(results[0].payload.toString()).to.eql(packet1.payload.toString());
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
        messageId: "42",
        retain: true
      };

      var client = {
        logger: pino({ level: "error" }),
        forward: function(topic, payload, options, pattern) {
          expect(topic).to.eql(packet1.topic);
          expect(payload).to.eql(packet1.payload);
          expect(options.topic).to.eql(packet1.topic);
          expect(options.payload).to.eql(packet1.payload);
          expect(options.qos).to.eql(packet1.qos);
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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

    it("should not remove the subscriptions after lookup", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        logger: pino({ level: "error" }),
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeSubscriptions(client, function() {
        instance.lookupSubscriptions(client, function() {
          instance.lookupSubscriptions(client, function(err, results) {
            expect(results).not.to.eql({});
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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
        }, that.opts.ttl.subscriptions * 2);
      });
    });

    it("should store a QoS 0 subscription", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: pino({ level: "error" }),
        subscriptions: {
          hello: {
            qos: 0
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
  });

  describe("offline packets", function() {
    var client = {
      id: "my client id - 42",
      clean: false,
      logger: pino({ level: "error" }),
      subscriptions: {
        hello: {
          qos: 1
        }
      }
    };

    var packet = {
      topic: "hello",
      qos: 1,
      payload: new Buffer("world"),
      messageId: "42"
    };

    beforeEach(function(done) {
      this.instance.storeSubscriptions(client, done);
    });

    it("should store an offline packet", function(done) {
      this.instance.storeOfflinePacket(packet, done);
    });

    it("should not stream any offline packet", function(done) {
      // ensure persistence engine call "done"
      this.instance.streamOfflinePackets(client, function(err, packet) {
        done(new Error("this should never be called"));
      }, done);
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
            expect(p2).to.eql(p);
            done();
          });
        });
      });
    });

    it("should delete an offline packet if said so", function(done) {
      var instance = this.instance;
      instance.storeOfflinePacket(packet, function() {
        instance.deleteOfflinePacket(client, packet.messageId, function(err) {
          instance.streamOfflinePackets(client, function(err, p2) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });
    });

    it("should update the id of an offline packet", function(done) {
      var instance = this.instance;
      instance.storeOfflinePacket(packet, function() {
        instance.streamOfflinePackets(client, function(err, p3) {
          var p4 = Object.create(p3);
          p4.messageId = "12345";
          instance.updateOfflinePacket(client, p3.messageId, p4, function(err) {
            instance.streamOfflinePackets(client, function(err, p2) {
              expect(p2.messageId).to.equal("12345");
              done();
            });
          });
        });
      });
    });

    it("should clean up the offline packets store if a clean client connects", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: pino({ level: "error" }),
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
        logger: pino({ level: "error" }),
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

    it("should store an offline packet for a client after lookup", function(done) {
      var instance = this.instance;
      var client = {
        id: "my client id - 42",
        clean: false,
        logger: pino({ level: "error" }),
        subscriptions: {
          hello: 1
        }
      };

      instance.lookupSubscriptions(client, function(err, results) {
        instance.storeOfflinePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            expect(p).to.eql(packet);
            done();
          });
        });
      });
    });

    it("should not stream any offline packet to a clean client", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);

      var client = {
        id: "my client id - 42",
        clean: false,
        logger: pino({ level: "error" }),
        subscriptions: {
          hello: {
            qos: 1
          }
        }
      };

      instance.storeOfflinePacket(packet, function() {
        client.clean = true;
        server.forwardOfflinePackets(client, done);
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
        delete options.payload;
        delete packet.payload;
        packet.offline = true;
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

  describe("multiple offline packets", function() {
    var client = {
      id: "my client id",
      clean: false,
      logger: pino({ level: "error" }),
      subscriptions: {
        hello: {
          qos: 1
        }
      }
    };

    var first_packet = {
      topic: "hello",
      qos: 1,
      payload: new Buffer("world"),
      messageId: "42"
    };

    var second_packet = {
      topic: "hello",
      qos: 1,
      payload: new Buffer("mosca"),
      messageId: "43"
    };

    beforeEach(function(done) {
      this.instance.storeSubscriptions(client, done);
    });

    it("should store and stream multiple offline packet", function(done) {
      var packets = [];
      function onStreamPacket(err, packet) {
        packets.push(packet);
        if (packets.length === 2) {
          expect(packets[0]).to.eql(first_packet);
          expect(packets[1]).to.eql(second_packet);
          done();
        }
      }

      var instance = this.instance;
      instance.storeOfflinePacket(first_packet, function() {
        instance.storeOfflinePacket(second_packet, function() {
          instance.streamOfflinePackets(client, onStreamPacket);
        });
      });
    });
  });

  describe("offline packets pattern", function() {
    var client = {
      id: "my client id - 42",
      clean: false,
      logger: pino({ level: "error" }),
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
      messageId: "42"
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
      qos: 1,
      payload: new Buffer("world"),
      messageId: "42"
    };
    var client = {
      id: "my client id - 42",
      clean: false,
      logger: pino({ level: "error" }),
      subscriptions: {
        hello: {
          qos: 1
        }
      },
      inflight: {
        42: packet
      }
    };

    it("should not delete the offline packets once streamed", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);

      instance.storeSubscriptions(client, function() {
        server.storePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            instance.streamOfflinePackets(client, function(err, p2) {
              expect(p2).to.eql(p);
              done();
            });
          });
        });
      });
    });

    it("should wire itself up to the persistClient method of a Server", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);

      client.handleAuthorizeSubscribe = function(err, success, s, cb) {
        return cb(null, true);
      };

      server.persistClient(client, function() {
        server.restoreClientSubscriptions(client, function(err) {
          done();
        });
      });
    });

    it("should not generate duplicate packets on persistClient", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);

      instance.storeSubscriptions(client, function() {
        server.storePacket(packet, function() {
          server.persistClient(client, function() {
            instance.streamOfflinePackets(client, function(err, packet) {
              //should be called only once
              done();
            });
          });
        });
      });

    });
  });

  describe("storeMessagesQos0 = false", function() {

    var client = {
      id : "my client id - 42",
      clean : false,
      subscriptions : {
        "hello/#" : {
          qos : 1
        }
      },
      logger : {
        debug : function() {
        }
      }
    };

    it("qos 0, retain false", function(done) {
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);
      instance.options.storeMessagesQos0 = false;

      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : false,
        payload : new Buffer("world"),
        // TODO: if messageId is an integer then persist redis test fail !!!
        messageId : "42"
      };
      
      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            done(new Error("this should never be called"));
          });
          done();
        });
      });

    });

    it("qos 0, retain true", function(done) {
      
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);
      instance.options.storeMessagesQos0 = false;
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : true,
        payload : new Buffer("world"),
        // TODO: if messageId is an integer then persist redis test fail !!!
        messageId : "42"
      };

      client.forward = function(topic, payload, options) {
        expect(topic).to.eql(packet.topic);
        expect(payload).to.eql(packet.payload);
        expect(options.topic).to.eql(packet.topic);
        expect(options.payload).to.eql(packet.payload);
        expect(options.qos).to.eql(packet.qos);
        done();
      };

      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          server.forwardRetained("hello/42", client);
          instance.streamOfflinePackets(client, function(err, p) {
            done(new Error("this should never be called"));
          });
        });
      });
    });

  });

  describe("storeMessagesQos0 = true", function() {
    
    var client = {
      id : "my client id - 42",
      clean : false,
      subscriptions : {
        "hello/#" : {
          qos : 1
        }
      },
      logger : {
        debug : function() {
        }
      }
    };

    it("qos 0, retain false", function(done) {
      
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);
      instance.options.storeMessagesQos0 = true;
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : false,
        payload : new Buffer("world"),
        // TODO: if messageId is an integer then persist redis test fail !!!
        messageId : "42"
      };

      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            expect(p).to.eql(packet);
            done();
          });
        });
      });
      
    });
    
    it("qos 0, retain true", function(done) {
      
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);
      instance.options.storeMessagesQos0 = true;
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : true,
        payload : new Buffer("world"),
        // TODO: if messageId is an integer then persist redis test fail !!!
        messageId : "42"
      };

      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance.streamOfflinePackets(client, function(err, p) {
            expect(p).to.eql(packet);
            done();
          });
        });
      });
      
    });
  });

  describe("storeMessagesQos0 = true, multiple", function() {
    
    var client = {
      id : "my client id - 42",
      clean : false,
      subscriptions : {
        "hello/#" : {
          qos : 1
        }
      },
      logger : {
        debug : function() {
        }
      }
    };

    var packet1 = {
      topic : "hello/42",
      qos : 0,
      retain : false,
      payload : new Buffer("hello"),
      // TODO: if messageId is an integer then persist redis test fail !!!
      messageId : "42"
    };

    var packet2 = {
      topic : "hello/42",
      qos : 0,
      retain : false,
      payload : new Buffer("my"),
      // TODO: if messageId is an integer then persist redis test fail !!!
      messageId : "43"
    };

    var packet3 = {
      topic : "hello/42",
      qos : 0,
      retain : false,
      payload : new Buffer("world"),
      // TODO: if messageId is an integer then persist redis test fail !!!
      messageId : "44"
    };

    it("multiple qos 0", function(done) {
      
      var server = new EventEmitter();
      var instance = this.instance;
      instance.wire(server);
      instance.options.storeMessagesQos0 = true;

      var packets = [];

      server.persistClient(client, function() {
        server.storePacket(packet1, function() {
          server.storePacket(packet2, function() {
            server.storePacket(packet3, function() {
              instance.streamOfflinePackets(client, function(err, p) {
			
                packets.push(p);

                if(packets.length == 3){
                  expect(packets[0]).to.eql(packet1);
                  expect(packets[1]).to.eql(packet2);
                  expect(packets[2]).to.eql(packet3);
                  done();
                }
              });
            });
          });
        });
      });
    });

  });

  describe("offline packets - not send is expired", function() {

    var client = {
      id : "my client id - 42",
      clean : false,
      subscriptions : {
        "hello/#" : {
          qos : 1
        }
      }
    };
 
    it("do not send expires packages", function(done) {
      var instance = this.instance;

      var packet = {
        topic : "hello/42",
        qos : 1,
        retain : false,
        payload : new Buffer("world"),
        messageId : "42"
      };

      instance.storeSubscriptions(client, function() {
        instance.storeOfflinePacket(packet, function() {
          setTimeout(function() {
            instance.streamOfflinePackets(client, function(err, p) {
              done(new Error("this should never be called"));
            }, done);
          }, instance.options.ttl.packets + 500);
        });
      });
    });

    it("do not send expires packages - multiple", function(done) {
      var instance = this.instance;

      var packet1 = {
        topic : "hello/42",
        qos : 1,
        retain : false,
        payload : new Buffer("hello"),
        messageId : "42"
      };

      var packet2 = {
        topic : "hello/42",
        qos : 1,
        retain : false,
        payload : new Buffer("my"),
        messageId : "43"
      };

      var packet3 = {
        topic : "hello/42",
        qos : 1,
        retain : false,
        payload : new Buffer("world"),
        messageId : "44"
      };

      instance.storeSubscriptions(client, function() {
        instance.storeOfflinePacket(packet1, function() {
          instance.storeOfflinePacket(packet2, function() {
            instance.storeOfflinePacket(packet3, function() {
              setTimeout(function() {
                instance.streamOfflinePackets(client, function(err, p) {
                  done(new Error("this should never be called"));
                }, done);
              }, instance.options.ttl.packets + 500);
            });
          });
        });
      });
    });

  });

};

