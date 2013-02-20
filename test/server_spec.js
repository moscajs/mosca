
var mqtt = require("mqtt");
var microtime = require("microtime");
var ascoltatori = require("ascoltatori");

describe(mosca.Server, function() {

  var instance;
  var settings;

  beforeEach(function(done) {
    settings = moscaSettings();
    instance = new mosca.Server(settings, done);
  });

  afterEach(function(done) {
    instance.close(done);
  });

  function donner(count, done) {
    return function() {
      count--;
      if(count === 0) {
        done();
      }
    };
  }

  function buildClient(done, callback) {
    mqtt.createClient(settings.port, settings.host, function(err, client) {
      if(err)
        done(err)
      else {
        client.on('close', function() {
          done();
        });
        client.on('error', done);

        callback(client);
      }
    });
  }

  function buildAndConnect(done, callback) {
    buildClient(done, function(client) {

      client.connect({ keepalive: 3000 });

      client.on('connack', function(packet) {
        callback(client);
      });
    });
  }

  it("should support connecting and disconnecting", function(done) {
    buildClient(done, function(client) {

      client.connect({ keepalive: 3000 });

      client.on('connack', function(packet) {
        client.disconnect();
      });
    });
  });

  it("should send a connack packet with returnCode 0", function(done) {
    buildClient(done, function(client) {

      client.connect({ keepalive: 3000 });

      client.on('connack', function(packet) {
        client.disconnect();
        expect(packet.returnCode).to.eql(0);
      });
    });
  });

  it("should close the connection after the keepalive interval", function(done) {
    buildClient(done, function(client) {
      var keepalive = 1;
      var timer = microtime.now();

      client.connect({ keepalive: keepalive });

      client.on("close", function() {
        var interval = (microtime.now() - timer) / 1000000;
        expect(interval).to.be.least(keepalive * 5/4);
      });
    });
  });

  it("should send a pingresp when it receives a pingreq", function(done) {
    buildAndConnect(done, function(client) {
      client.on("pingresp", function() {
        client.disconnect();
      });

      client.pingreq();
    });
  });

  it("should correctly renew the keepalive window after a pingreq", function(done) {
    buildClient(done, function(client) {
      var keepalive = 1;
      var timer = microtime.now();

      client.connect({ keepalive: keepalive });

      client.on("close", function() {
        var interval = (microtime.now() - timer) / 1000000;
        expect(interval).to.be.least(keepalive + keepalive / 4);
      });
      
      setTimeout(function() {
        client.pingreq();
      }, keepalive * 1000 / 4 );
    });
  });

  it("should support subscribing", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("suback", function(packet) {
        client.disconnect();
        expect(packet).to.have.property("messageId", messageId);
      });

      client.subscribe({ topic: "hello", messageId: messageId });
    });
  });

  it("should support subscribing only to QoS 0", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("suback", function(packet) {
        client.disconnect();
        expect(packet.granted).to.be.deep.equal([0]);
      });

      client.subscribe({ topic: "hello", messageId: messageId, qos: 1});
    });
  });

  it("should support subscribing to multiple topics", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("suback", function(packet) {
        client.disconnect();
        expect(packet.granted).to.be.deep.equal([0, 0]);
      });

      client.subscribe({
        subscriptions: [{ topic: "hello", qos: 1 }, { topic: "hello2", qos: 0 }],
        messageId: messageId
      });
    });
  });

  it("should support subscribing and publishing", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client1) {

      client1.on("publish", function(packet) {
        client1.disconnect();
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload).to.be.equal("some data");
      });

      client1.on("suback", function() {
        buildAndConnect(d, function(client2) {
          client2.publish({ topic: "hello", payload: "some data" });
          client2.disconnect();
        });
      });

      client1.subscribe({ topic: "hello" });
    });
  });

  it("should support unsubscribing", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("unsuback", function(packet) {
        expect(packet).to.have.property("messageId", messageId);
        client.disconnect();
      });

      client.on("suback", function(packet) {
        client.unsubscribe({
          topic: "hello",
          messageId: messageId
        });
      });

      client.subscribe({
        topic: "hello"
      });
    });
  });

  it("should unsubscribe for real", function(done) {
    buildAndConnect(done, function(client) {

      client.on("publish", function(packet) {
        client.disconnect();
        throw new Error("a message could not have been published");
      });

      client.on("unsuback", function(packet) {
        client.disconnect();
        client.publish({ topic: "hello", payload: "data" });
      });

      client.on("suback", function(packet) {
        client.unsubscribe({
          topic: "hello"
        });
      });

      client.subscribe({
        topic: "hello"
      });
    });
  });

  it("should emit an event on every newly published packet", function(done) {
    buildAndConnect(done, function(client) {

      instance.on("published", function(packet, serverClient) {
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload).to.be.equal("some data");
        expect(serverClient).not.to.be.undefined;
        client.disconnect();
      });

      client.publish({ topic: "hello", payload: "some data" });
    });
  });

  it("should emit an event when a new client is connected", function(done) {
    buildClient(done, function(client) {

      instance.on("clientConnected", function(serverClient) {
        expect(serverClient).not.to.be.undefined;
        client.disconnect();
      });

      client.connect({ keepalive: 3000 });
    });
  });

  it("should emit an event when a client is disconnected", function(done) {
    mqtt.createClient(settings.port, settings.host, function(err, client) {
      if(err) {
        done(err);
        return;
      }

      instance.on('clientDisconnected', function(serverClient) {
        expect(serverClient).not.to.be.undefined;
        done();
      });

      client.on('error', done);

      client.on('connack', function() {
        client.disconnect();
      });

      client.connect();
    });
  });

  it("should emit a ready and closed events", function(done) {
    var server = new mosca.Server(moscaSettings());
    async.series([
      function (cb) {
        server.on("ready", cb);
      },
      function (cb) {
        server.on("closed", done);
        cb();
      },
      function(cb) {
        server.close();
      }
    ]);
  });

  it("should pass the backend settings to ascoltatori.build", function(done) {
    var spy = sinon.spy(ascoltatori, "build");
    var newSettings = moscaSettings();

    newSettings.backend = {
      type: "mqtt",
      port: settings.port,
      host: "127.0.0.1", 
      mqtt: require("mqtt")
    };

    var server = new mosca.Server(newSettings);

    async.series([
      function (cb) {
        server.on("ready", cb);
      },
      function (cb) {
        expect(spy).to.have.been.calledWith(newSettings.backend);
        cb();
      },
      function (cb) {
        server.close(cb);
      }
    ], done);
  });

  it("should support subscribing to wildcards", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client1) {

      client1.on("publish", function(packet) {
        expect(packet.topic).to.be.equal("hello/world");
        expect(packet.payload).to.be.equal("some data");
        client1.disconnect();
      });

      client1.on("suback", function() {
        buildAndConnect(d, function(client2) {
          client2.publish({ topic: "hello/world", payload: "some data" });
          client2.disconnect();
        });
      });

      client1.subscribe({ topic: "hello/#" });
    });
  });
});
