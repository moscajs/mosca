'use strict';

var EventEmitter = require("events").EventEmitter;

describe("mosca.Stats", function() {
  var instance;
  var server;
  var clock;
  var interval = 10;

  beforeEach(function() {
    clock = sinon.useFakeTimers();
    server = new EventEmitter();
    server.id = 42;
    instance = new mosca.Stats();
    instance.wire(server);

    server.publish = function(packet) {
      server.emit("testPublished", packet);
    };
  });

  afterEach(function() {
    clock.restore();
    server.emit("closed");
  });

  describe("counting connected clients", function() {

    it("should start from zero", function() {
      expect(instance.connectedClients).to.eql(0);
    });

    it("should increase when clientConnected is emitted", function() {
      server.emit("clientConnected");
      expect(instance.connectedClients).to.eql(1);
    });

    it("should decrease when clientDisconnected is emitted", function() {
      server.emit("clientConnected");
      server.emit("clientDisconnected");
      expect(instance.connectedClients).to.eql(0);
    });

    it("should track maximum clients connected", function() {
      server.emit("clientConnected");
      server.emit("clientDisconnected");
      expect(instance.maxConnectedClients).to.eql(1);
    });

    it("should grow past 1", function() {
      server.emit("clientConnected");
      server.emit("clientConnected");
      server.emit("clientConnected");
      expect(instance.connectedClients).to.eql(3);
    });

    it("should publish it every 10s", function(done) {
      server.emit("clientConnected");
      server.emit("clientConnected");

      server.on("testPublished", function(packet) {
        if (packet.topic === "$SYS/42/clients/connected") {
          expect(packet.payload).to.eql("2");
          done();
        }
      });

      clock.tick(interval * 1000);
    });
  });

  describe("counting published messages", function() {

    it("should start from zero", function() {
      expect(instance.publishedMessages).to.eql(0);
    });

    it("should increase when published is emitted", function() {
      server.emit("published", { topic: 'mosca/stats/test/publishes' });
      expect(instance.publishedMessages).to.eql(1);
    });

    it("should increase when published is emitted (two)", function() {
      server.emit("published", { topic: 'mosca/stats/test/publishes' });
      server.emit("published", { topic: 'mosca/stats/test/publishes' });
      expect(instance.publishedMessages).to.eql(2);
    });

    it("should publish it every 10s", function(done) {
      server.emit("published", { topic: 'mosca/stats/test/publishes' });
      server.emit("published", { topic: 'mosca/stats/test/publishes' });
      server.emit("published", { topic: 'mosca/stats/test/publishes' });

      server.on("testPublished", function(packet) {
        if (packet.topic === "$SYS/42/publish/received") {
          expect(packet.payload).to.eql("3");
          done();
        }
      });

      clock.tick(interval * 1000);
    });
  });

  describe("tracking load", function() {

    var toBeCleared;

    afterEach(function() {
      if (toBeCleared) {
        clearInterval(toBeCleared);
      }
    });

    var events = {
      published: "publishedMessages",
      clientConnected: "connectedClients"
    };

    var topics = {
      published: "/load/publish/received/",
      clientConnected: "/load/connections/",
    };

    var buildTimer = {
      published: function() {
        return setInterval(function() {
          server.emit("published", { topic: 'mosca/stats/test/publishes' });
          server.emit("published", { topic: 'mosca/stats/test/publishes' });
        }, interval * 1000);
      },
      clientConnected: function(minutes) {
        return setInterval(function() {
          server.emit("clientConnected");
          server.emit("clientConnected");
        }, interval * 1000);
      }
    };

    Object.keys(events).forEach(function(event) {
      describe(event, function() {

        describe("m15", function() {

          it("should start from zero", function() {
            server.emit(event);
            server.emit(event);
            expect(instance.load.m15[events[event]]).to.eql(0);
          });

          it("should cover the last 15 minutes", function() {
            toBeCleared = buildTimer[event](15);
            clock.tick(15 * 60 * 1000 + 1);
            expect(instance.load.m15[events[event]]).to.eql(1.26);
          });

          it("should publish it", function(done) {
            toBeCleared = buildTimer[event](15);

            var count = 0;

            server.on("testPublished", function(packet) {
              if (packet.topic === "$SYS/42" + topics[event] + "15min") {
                count++;

                if (count % (15 * 6) === 0) {
                  expect(packet.payload).to.eql("1.26");
                  done();
                }
              }
            });

            clock.tick(60 * 1000 * 15);
          });
        });

        describe("m5", function() {

          it("should start from zero", function() {
            server.emit(event);
            server.emit(event);
            expect(instance.load.m5[events[event]]).to.eql(0);
          });

          it("should cover the last 5 minutes", function() {
            toBeCleared = buildTimer[event](5);
            clock.tick(5 * 60 * 1000 + 1);
            expect(instance.load.m5[events[event]]).to.eql(1.24);
          });

          it("should publish it", function(done) {
            toBeCleared = buildTimer[event](5);

            var count = 0;

            server.on("testPublished", function(packet) {
              if (packet.topic === "$SYS/42" + topics[event] + "5min") {
                count++;

                if (count % (5 * 6) === 0) {
                  expect(packet.payload).to.eql("1.24");
                  done();
                }
              }
            });

            clock.tick(60 * 1000 * 5);
          });
        });

        describe("m1", function() {

          it("should start from zero", function() {
            server.emit(event);
            server.emit(event);
            expect(instance.load.m1[events[event]]).to.eql(0);
          });

          it("should cover the last minute", function() {
            toBeCleared = buildTimer[event](1);
            clock.tick(60 * 1000 + 1);
            expect(instance.load.m1[events[event]]).to.eql(1.13);
          });

          it("should publish it", function(done) {
            toBeCleared = buildTimer[event](1);

            var count = 0;

            server.on("testPublished", function(packet) {
              if (packet.topic === "$SYS/42" + topics[event] + "1min") {
                count++;

                if (count % 6 === 0) {
                  expect(packet.payload).to.eql("1.13");
                  done();
                }
              }
            });

            clock.tick(60 * 1000);
          });
        });
      });
    });
  });

  describe("on closed", function() {
    ["clientConnected", "clientDisconnected", "published"].forEach(function(event) {
      it("should remove the " + event + " event from the server", function() {
        server.emit("closed");
        expect(server.listeners(event).length).to.eql(0);
      });
    });
  });

  it("should publish the version every 10s", function(done) {
    var version = require("../package").version;
    server.on("testPublished", function(packet) {
      if (packet.topic === "$SYS/42/version") {
        expect(packet.payload).to.eql("mosca " + version);
        done();
      }
    });

    clock.tick(interval * 1000);
  });

  it("should publish the start time", function(done) {
    server.on("testPublished", function(packet) {
      if (packet.topic === "$SYS/42/started_at") {
        expect(packet.payload).to.eql(instance.started.toISOString());
        done();
      }
    });

    clock.tick(interval * 1000);
  });

  it("should publish the uptime every 10s", function(done) {
    server.on("testPublished", function(packet) {
      if (packet.topic === "$SYS/42/uptime") {
        expect(packet.payload).to.eql("10 seconds");
        done();
      }
    });

    clock.tick(interval * 1000);
  });

  it("should publish the uptime (bis)", function(done) {
    clock.tick(60 * 1000 * 2);

    server.on("testPublished", function func(packet) {
      if (packet.topic === "$SYS/42/uptime" &&
         packet.payload === "180 seconds") {
        server.removeListener("testPublished", func);
        done();
      }
    });

    clock.tick(60 * 1000);
  });

  describe("memory", function() {
    var stub;

    beforeEach(function() {
      stub = sinon.stub(process, "memoryUsage");
      stub.returns({ rss: 4201, heapUsed: 4202, heapTotal: 4203 });
    });

    afterEach(function() {
      stub.restore();
    });

    var stats = {
      rss: "rss",
      heapTotal: "heap/maximum",
      heapUsed: "heap/current"
    };

    Object.keys(stats).forEach(function(stat) {
      it("should publish " + stat + " every minute", function(done) {
        server.on("testPublished", function(packet) {
          var mem = process.memoryUsage();
          if (packet.topic === "$SYS/42/memory/" + stats[stat]) {
            expect(packet.payload).to.eql("" + mem[stat]);
            done();
          }
        });

        clock.tick(interval * 1000);
      });
    });
  });
});
