
var mqtt = require("mqtt");
var microtime = require("microtime");
var ascoltatori = require("ascoltatori");

describe(mosca.Server, function() {

  var instance;
  var secondInstance = null;
  var settings;

  function buildOpts() {
    return {
      keepalive: 10000,
      clientId: 'mosca_' + require("crypto").randomBytes(16).toString('hex'),
      protocolId: 'MQIsdp',
      protocolVersion: 3
    };
  }

  beforeEach(function(done) {
    settings = moscaSettings();
    instance = new mosca.Server(settings, done);
  });

  afterEach(function(done) {
    var instances = [instance];

    if (secondInstance) {
      instances = [secondInstance].concat(instances);
    }

    async.parallel(instances.map(function (i) {
      return function (cb) {
        i.close(cb);
      };
    }), function() {
      done();
    });
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
    var client = mqtt.createConnection(settings.port, settings.host);

    client.once('error', done);
    client.stream.once('close', function() {
      done();
    });

    client.on("connected", function () {
      callback(client);
    });
  }


  function buildAndConnect(done, callback) {
    buildClient(done, function(client) {

      client.connect(buildOpts());

      client.on('connack', function(packet) {
        callback(client);
      });
    });
  }

  it("should support connecting and disconnecting", function(done) {
    buildClient(done, function(client) {

      client.connect(buildOpts());

      client.on('connack', function(packet) {
        client.disconnect();
      });
    });
  });

  it("should send a connack packet with returnCode 0", function(done) {
    buildClient(done, function(client) {

      client.connect(buildOpts());

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

      var opts = buildOpts();
      opts.keepalive = keepalive;

      client.connect(opts);

      client.stream.on("close", function() {
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

      var opts = buildOpts();
      opts.keepalive = keepalive;

      client.connect(opts);

      client.stream.on("close", function() {
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
        expect(packet).to.have.property("messageId", messageId);
        client.disconnect();
      });

      client.subscribe({ subscriptions: [{ topic: "hello", qos: 0 }], messageId: messageId });
    });
  });

  it("should support subscribing only to QoS 0", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("suback", function(packet) {
        expect(packet.granted).to.be.deep.equal([0]);
        client.disconnect();
      });

      client.subscribe({ subscriptions: [{ topic: "hello", qos: 1 }], messageId: messageId });
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

      var messageId = Math.floor(65535 * Math.random());

      client1.on("publish", function(packet) {
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload).to.be.equal("some data");
        client1.disconnect();
      });

      client1.on("suback", function() {
        buildAndConnect(d, function(client2) {
          client2.publish({ topic: "hello", payload: "some data", messageId: messageId });
          client2.disconnect();
        });
      });

      client1.subscribe({ subscriptions: [{ topic: "hello", qos: 1 }], messageId: messageId });
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
        client.unsubscribe({ unsubscriptions: ["hello"], messageId: messageId });
      });

      client.subscribe({ subscriptions: [{ topic: "hello", qos: 1 }], messageId: messageId });
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
        client.unsubscribe({ unsubscriptions: ["hello"], messageId: messageId });
      });

      var messageId = Math.floor(65535 * Math.random());
      client.subscribe({ subscriptions: [{ topic: "hello", qos: 1 }], messageId: messageId });
    });
  });

  it("should emit an event on every newly published packet", function(done) {
    buildAndConnect(done, function(client) {

      instance.on("published", function(packet, serverClient) {
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload).to.be.equal("some data");
        expect(serverClient).not.to.be.equal(undefined);
        client.disconnect();
      });

      client.publish({ topic: "hello", payload: "some data" });
    });
  });

  it("should emit an event when a new client is connected", function(done) {
    buildClient(done, function(client) {

      instance.on("clientConnected", function(serverClient) {
        expect(serverClient).not.to.be.equal(undefined);
        client.disconnect();
      });

      client.connect(buildOpts());
    });
  });

  it("should emit an event when a client is disconnected", function(done) {
    var client = mqtt.createConnection(settings.port, settings.host);

    instance.on('clientDisconnected', function(serverClient) {
      expect(serverClient).not.to.be.equal(undefined);
      done();
    });

    client.on('error', done);

    client.on('connack', function() {
      client.disconnect();
    });

    client.connect(buildOpts());
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

      client1.subscribe({ subscriptions: [{ topic: "hello/#", qos: 0 }], messageId: 42 });
    });
  });

  it("should support subscribing correctly to wildcards in a tree-based topology", function(done) {
    var d = donner(3, done);

    async.waterfall([
      function (cb) {
        settings.backend = {
          port: settings.port,
          type: "mqtt"
        };
        settings.port = settings.port + 1000;
        secondInstance = new mosca.Server(settings, cb);
      },
      function (cb) {
        buildAndConnect(d, function (client1) {
          cb(null, client1);
        });
      },
      function (client1, cb) {
        var called = false;
        client1.on("publish", function(packet) {
          expect(called).to.be.eql(false);
          called = true;
          setTimeout(function () {
            client1.disconnect();
          });
        });

        client1.subscribe({ subscriptions: [{ topic: "hello/#", qos: 0 }], messageId: 42 });
        client1.on("suback", function () {
          cb(null);
        });
      },
      function (cb) {
        buildAndConnect(d, function (client3) {
          cb(null, client3);
        });
      },
      function (client3, cb) {
        client3.subscribe({ subscriptions: [{ topic: "hello/#", qos: 0 }], messageId: 42 });
        client3.on("suback", function () {
          // we need to simulate a "stuck" subscription
          client3.stream.end();
          cb(null);
        });
      },
      function (cb) {
        buildAndConnect(d, function(client2) {
          cb(null, client2);
        });
      },
      function (client2, cb) {
        client2.publish({ topic: "hello/world", payload: "some data" });
        client2.disconnect();
      }
    ]);
  });

  it("should not wrap messages with \"\" in a tree-based topology", function(done) {
    var d = donner(2, done);

    async.waterfall([
      function (cb) {
        buildAndConnect(d, function (client1) {
          cb(null, client1);
        });
      },
      function (client1, cb) {
        client1.on("publish", function(packet) {
          expect(packet.payload).to.be.eql("some data");
          client1.disconnect();
        });

        client1.subscribe({ subscriptions: [{ topic: "hello/#", qos: 0 }], messageId: 42 });
        client1.on("suback", function () {
          cb(null);
        });
      },
      function (cb) {
        settings.backend = {
          port: settings.port,
          type: "mqtt"
        };
        settings.port = settings.port + 1000;
        secondInstance = new mosca.Server(settings, cb);
      },
      function (cb) {
        buildAndConnect(d, function(client2) {
          cb(null, client2);
        });
      },
      function (client2, cb) {
        client2.publish({ topic: "hello/world", payload: "some data" });
        client2.disconnect();
      }
    ]);
  });

  it("should support unsubscribing a single client", function(done) {
    var d = donner(2, done);

    async.waterfall([
      function (cb) {
        buildAndConnect(d, function (client1) {
          cb(null, client1);
        });
      },
      function (client1, cb) {
        var called = false;
        client1.on("publish", function(packet) {
          // we are expecting this
          client1.disconnect();
        });

        client1.subscribe({ subscriptions: [{ topic: "hello/#", qos: 0 }], messageId: 42 });
        client1.on("suback", function () {
          cb(null, client1);
        });
      },
      function (client1, cb) {
        buildAndConnect(d, function (client3) {
          cb(null, client1, client3);
        });
      },
      function (client1, client3, cb) {
        client3.subscribe({ subscriptions: [{ topic: "hello/#", qos: 0 }], messageId: 42 });
        client3.on("suback", function () {
          client3.disconnect();
          cb(null);
        });
      },
      function (cb) {
        buildAndConnect(d, function(client2) {
          cb(null, client2);
        });
      },
      function (client2, cb) {
        client2.publish({ topic: "hello/world", payload: "some data" });
        client2.disconnect();
      }
    ]);
  });
});
