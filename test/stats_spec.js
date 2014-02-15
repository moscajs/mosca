var EventEmitter = require("events").EventEmitter;

describe("mosca.Stats", function() {
  var instance;
  var server;
  var clock;

  beforeEach(function() {
    clock = sinon.useFakeTimers();
    server = new EventEmitter();
    instance = new mosca.Stats();
    instance.wire(server);
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
  });

  describe("tracking load", function() {

    var events = {
      published: "publishedMessages",
      clientConnected: "connectedClients"
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
});
