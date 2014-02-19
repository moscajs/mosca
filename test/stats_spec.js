var EventEmitter = require("events").EventEmitter;

describe("mosca.Stats", function() {
  var instance;
  var server;
  var clock;

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

    it("should grow past 1", function() {
      server.emit("clientConnected");
      server.emit("clientConnected");
      server.emit("clientConnected");
      expect(instance.connectedClients).to.eql(3);
    });

    it("should publish it every minute", function(done) {
      server.emit("clientConnected");
      server.emit("clientConnected");

      server.on("testPublished", function(packet) {
        if (packet.topic === "$SYS/42/connections") {
          expect(packet.payload).to.eql("2");
          done();
        }
      });

      clock.tick(60 * 1000);
    });
  });

  describe("counting published messages", function() {

    it("should start from zero", function() {
      expect(instance.publishedMessages).to.eql(0);
    });

    it("should increase when published is emitted", function() {
      server.emit("published");
      expect(instance.publishedMessages).to.eql(1);
    });

    it("should increase when published is emitted (two)", function() {
      server.emit("published");
      server.emit("published");
      expect(instance.publishedMessages).to.eql(2);
    });

    it("should publish it every minute", function(done) {
      server.emit("published");
      server.emit("published");
      server.emit("published");

      server.on("testPublished", function(packet) {
        if (packet.topic === "$SYS/42/publish/received") {
          expect(packet.payload).to.eql("3");
          done();
        }
      });

      clock.tick(60 * 1000);
    });
  });

  describe("tracking load", function() {

    var events = {
      published: "publishedMessages",
      clientConnected: "connectedClients"
    };

    var topics = {
      published: "/load/publish/received/",
      clientConnected: "/load/connections/",
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
            server.emit(event);
            server.emit(event);
            clock.tick(15 * 60 * 1000 + 1);
            expect(instance.load.m15[events[event]]).to.eql(2);
          });

          it("should show only the data in the previous interval", function() {
            server.emit(event);
            server.emit(event);
            clock.tick(16 * 60 * 1000);
            clock.tick(16 * 60 * 1000);
            expect(instance.load.m15[events[event]]).to.eql(0);
          });

          it("should publish it every minute", function(done) {
            server.emit(event);
            server.emit(event);

            var count = 0;

            server.on("testPublished", function(packet) {
              if (packet.topic === "$SYS/42" + topics[event] + "15m") {
                count++;

                if (count % 15 === 0) {
                  expect(packet.payload).to.eql("2");
                  done();
                } else {
                  expect(packet.payload).to.eql("0");
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

          it("should cover the last 15 minutes", function() {
            server.emit(event);
            server.emit(event);
            clock.tick(5 * 60 * 1000 + 1);
            expect(instance.load.m5[events[event]]).to.eql(2);
          });

          it("should show only the data in the previous interval", function() {
            server.emit(event);
            server.emit(event);
            clock.tick(5 * 60 * 1000);
            clock.tick(5 * 60 * 1000);
            expect(instance.load.m5[events[event]]).to.eql(0);
          });

          it("should publish it every minute", function(done) {
            server.emit(event);
            server.emit(event);

            var count = 0;

            server.on("testPublished", function(packet) {
              if (packet.topic === "$SYS/42" + topics[event] + "5m") {
                count++;

                if (count % 5 === 0) {
                  expect(packet.payload).to.eql("2");
                  done();
                } else {
                  expect(packet.payload).to.eql("0");
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
            server.emit(event);
            server.emit(event);
            clock.tick(60 * 1000 + 1);
            expect(instance.load.m1[events[event]]).to.eql(2);
          });

          it("should show only the data in the previous interval", function() {
            server.emit(event);
            server.emit(event);
            clock.tick(60 * 1000);
            clock.tick(60 * 1000);
            expect(instance.load.m1[events[event]]).to.eql(0);
          });

          it("should publish it every minute", function(done) {
            server.emit(event);
            server.emit(event);

            server.on("testPublished", function(packet) {
              if (packet.topic === "$SYS/42" + topics[event] + "1m") {
                expect(packet.payload).to.eql("2");
                done();
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

  it("should publish the version", function(done) {
    var version = require("../package").version;
    server.on("testPublished", function(packet) {
      if (packet.topic === "$SYS/42/version") {
        expect(packet.payload).to.eql("mosca " + version);
        done();
      }
    });

    clock.tick(60 * 1000);
  });

  it("should publish the uptime", function(done) {
    server.on("testPublished", function(packet) {
      if (packet.topic === "$SYS/42/uptime") {
        expect(packet.payload).to.eql("a minute");
        done();
      }
    });

    clock.tick(60 * 1000);
  });

  it("should publish the uptime (bis)", function(done) {
    var count = 0;

    clock.tick(60 * 1000 * 2);

    server.on("testPublished", function(packet) {
      if (packet.topic === "$SYS/42/uptime") {
        expect(packet.payload).to.eql("3 minutes");
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

    ["rss", "heapTotal", "heapUsed"].forEach(function(event) {
      it("should publish " + event + " every minute", function(done) {
        server.on("testPublished", function(packet) {
          var mem = process.memoryUsage();
          if (packet.topic === "$SYS/42/memory/" + event) {
            expect(packet.payload).to.eql("" + mem[event]);
            done();
          }
        });

        clock.tick(60 * 1000);
      });
    });
  });
});
