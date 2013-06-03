var async = require("async");
var mqtt = require("mqtt");
var microtime = require("microtime");
var ascoltatori = require("ascoltatori");

describe("mosca.Server", function() {

  var instance;
  var secondInstance;
  var settings;

  function buildOpts() {
    return {
      keepalive: 1000,
      clientId: 'mosca_' + require("crypto").randomBytes(16).toString('hex'),
      protocolId: 'MQIsdp',
      protocolVersion: 3
    };
  }

  beforeEach(function(done) {
    settings = moscaSettings();
    instance = new mosca.Server(settings, done);
    secondInstance = null;
  });

  afterEach(function(done) {
    var instances = [instance];

    if (secondInstance) {
      instances = [secondInstance].concat(instances);
    }

    async.parallel(instances.map(function(i) {
      return function(cb) {
        i.close(cb);
      };
    }), function() {
      done();
    });
  });

  function donner(count, done) {
    return function() {
      count--;
      if (count === 0) {
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

    client.on("connected", function() {
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
        expect(interval).to.be.least(keepalive * 5 / 4);
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
      }, keepalive * 1000 / 4);
    });
  });

  it("should support subscribing", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      client.on("suback", function(packet) {
        expect(packet).to.have.property("messageId", messageId);
        client.disconnect();
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should support subscribing to multiple topics", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }, {
          topic: "hello2",
          qos: 0
        }
      ];


      client.on("suback", function(packet) {
        client.disconnect();
        expect(packet.granted).to.be.deep.equal([1, 0]);
      });


      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should support subscribing and publishing", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client1) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      client1.on("publish", function(packet) {
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload).to.be.equal("some data");
        client1.disconnect();
      });

      client1.on("suback", function() {
        buildAndConnect(d, function(client2) {
          client2.publish({
            topic: "hello",
            payload: "some data",
            messageId: messageId
          });
          client2.disconnect();
        });
      });

      client1.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should support unsubscribing", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];


      client.on("unsuback", function(packet) {
        expect(packet).to.have.property("messageId", messageId);
        client.disconnect();
      });

      client.on("suback", function(packet) {
        client.unsubscribe({
          unsubscriptions: ["hello"],
          messageId: messageId
        });
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
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
        client.publish({
          topic: "hello",
          payload: "data" 
        });
      });

      client.on("suback", function(packet) {
        client.unsubscribe({
          unsubscriptions: ["hello"],
          messageId: messageId
        });
      });

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];
      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
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

      client.publish({
        topic: "hello",
        payload: "some data"
      });
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

      function(cb) {
        server.on("ready", cb);
      },

      function(cb) {
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

      function(cb) {
        server.on("ready", cb);
      },

      function(cb) {
        expect(spy).to.have.been.calledWith(newSettings.backend);
        cb();
      },

      function(cb) {
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
          client2.publish({
            topic: "hello/world",
            payload: "some data"
          });
          client2.disconnect();
        });
      });

      var subscriptions = [{
          topic: "hello/#",
          qos: 0
        }
      ];
      client1.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("should support subscribing correctly to wildcards in a tree-based topology", function(done) {
    var d = donner(3, done);

    async.waterfall([

      function(cb) {
        settings.backend = {
          port: settings.port,
          type: "mqtt"
        };
        settings.port = nextPort();
        secondInstance = new mosca.Server(settings, cb);
      },

      function(cb) {
        buildAndConnect(d, function(client1) {
          cb(null, client1);
        });
      },

      function(client1, cb) {
        var called = false;
        client1.on("publish", function(packet) {
          expect(called).to.be.eql(false);
          called = true;
          setTimeout(function() {
            client1.disconnect();
          });
        });

        var subscriptions = [{
            topic: "hello/#",
            qos: 0
          }
        ];
        client1.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });

        client1.on("suback", function() {
          cb(null);
        });
      },

      function(cb) {
        buildAndConnect(d, function(client3) {
          cb(null, client3);
        });
      },

      function(client3, cb) {
        var subscriptions = [{
            topic: "hello/#",
            qos: 0
          }
        ];
        client3.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });
        client3.on("suback", function() {
          // we need to simulate a "stuck" subscription
          client3.stream.end();
          cb(null);
        });
      },

      function(cb) {
        buildAndConnect(d, function(client2) {
          cb(null, client2);
        });
      },

      function(client2, cb) {
        client2.publish({
          topic: "hello/world",
          payload: "some data"
        });
        client2.disconnect();
      }
    ]);
  });

  it("should not wrap messages with \"\" in a tree-based topology", function(done) {
    var d = donner(2, done);

    async.waterfall([

      function(cb) {
        buildAndConnect(d, function(client1) {
          cb(null, client1);
        });
      },

      function(client1, cb) {
        client1.on("publish", function(packet) {
          expect(packet.payload).to.be.eql("some data");
          client1.disconnect();
        });

        var subscriptions = [{
            topic: "hello/#",
            qos: 0
          }
        ];

        client1.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });
        client1.on("suback", function() {
          cb(null);
        });
      },

      function(cb) {
        settings.backend = {
          port: settings.port,
          type: "mqtt"
        };
        settings.port = settings.port + 1000;
        secondInstance = new mosca.Server(settings, cb);
      },

      function(cb) {
        buildAndConnect(d, function(client2) {
          cb(null, client2);
        });
      },

      function(client2, cb) {
        client2.publish({
          topic: "hello/world",
          payload: "some data"
        });
        client2.disconnect();
      }
    ]);
  });

  it("should support unsubscribing a single client", function(done) {
    var d = donner(2, done);

    async.waterfall([

      function(cb) {
        buildAndConnect(d, function(client1) {
          cb(null, client1);
        });
      },

      function(client1, cb) {
        var called = false;
        client1.on("publish", function(packet) {
          // we are expecting this
          client1.disconnect();
        });

        var subscriptions = [{
            topic: "hello/#",
            qos: 0
          }
        ];

        client1.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });
        client1.on("suback", function() {
          cb(null, client1);
        });
      },

      function(client1, cb) {
        buildAndConnect(d, function(client3) {
          cb(null, client1, client3);
        });
      },

      function(client1, client3, cb) {
        var subscriptions = [{
            topic: "hello/#",
            qos: 0
          }
        ];
        client3.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });
        client3.on("suback", function() {
          client3.disconnect();
          cb(null);
        });
      },

      function(cb) {
        buildAndConnect(d, function(client2) {
          cb(null, client2);
        });
      },

      function(client2, cb) {
        client2.publish({
          topic: "hello/world",
          payload: "some data"
        });
        client2.disconnect();
      }
    ]);
  });

  it("should support send a puback when publishing QoS 1 messages", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("puback", function(packet) {
        expect(packet).to.have.property("messageId", messageId);
        client.disconnect();
      });

      client.publish({
        topic: "hello",
        qos: 1,
        messageId: messageId
      });
    });
  });

  it("should support subscribing to QoS 1", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      client.on("suback", function(packet) {
        expect(packet.granted).to.be.deep.equal([1]);
        client.disconnect();
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should resend messages if a subscription is done with QoS 1", function(done) {
    buildAndConnect(done, function(client) {

      client.once("publish", function(packet1) {
        // the first time we do nothing
        process.nextTick(function() {
          client.once("publish", function(packet2) {
            expect(packet2).to.be.deep.equal(packet1);
            client.disconnect();
          });
        });
      });

      client.on("suback", function(packet) {
        client.publish({
          topic: "hello",
          qos: 1,
          messageId: 24
        });
      });

      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      client.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("should receive all messages at QoS 0 if a subscription is done with QoS 0", function(done) {
    buildAndConnect(done, function(client) {

      client.once("publish", function(packet) {
        expect(packet.qos).to.be.equal(0);
        client.disconnect();
      });

      client.on("suback", function(packet) {
        client.publish({
          topic: "hello",
          qos: 1,
          messageId: 24
        });
      });

      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      client.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("should receive at QoS 0 all messages published at QoS 0 even if subscribed at QoS 1", function(done) {
    buildAndConnect(done, function(client) {

      client.once("publish", function(packet) {
        expect(packet.qos).to.be.equal(0);
        client.disconnect();
      });

      client.on("suback", function(packet) {
        client.publish({
          topic: "hello",
          qos: 0,
          messageId: 24
        });
      });

      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      client.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("QoS 1 wildcard subscriptions should receive QoS 1 messages at QoS 1", function (done) {
    buildAndConnect(done, function (client) {
      client.on("publish", function(packet) {
        expect(packet.qos).to.be.equal(1);
        client.disconnect();
      });

      client.on("suback", function(packet) {
        client.publish({
          topic: "hello/foo",
          qos: 1,
          messageId: 24
        });
      });

      var subscriptions = [{
        topic: "hello/#",
        qos: 1
      }];

      client.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("should support will message", function(done) {

    async.waterfall([

      function(cb) {
        var client = mqtt.createConnection(settings.port, settings.host);

        client.on("connected", function() {
          var opts = buildOpts();
          opts.will = {
            topic: "/hello/died",
            payload: "client1 died",
            qos: 1
          };

          client.connect(opts);

          client.on('connack', function(packet) {

            cb(null, client);
          });
        });
      },

      function(client1, cb) {
        var subscriptions = [{
            topic: "hello/world",
            qos: 0
          }
        ];
        client1.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });
        client1.on("suback", function() {
          cb(null, client1);
        });
      },

      function(client1, cb) {
        buildAndConnect(done, function(client3) {
          cb(null, client1, client3);
        });
      },

      function(client1, client3, cb) {
        var subscriptions = [{
            topic: "/hello/died",
            qos: 0
          }
        ];
        client3.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });
        client3.on("suback", function() {
          client1.stream.end();
          cb(null);
        });
        client3.on("publish", function(packet) {
          expect(packet.topic).to.be.eql("/hello/died");
          expect(packet.payload).to.be.eql("client1 died");
          client3.disconnect();
        });
      }
    ]);
  });

  it("should pass mosca options to backend when publishing", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      expect(username).to.be.eql("matteo");
      expect(password).to.be.eql("collina");
      client.user = username;
      callback(null, true);
    };

    buildClient(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      instance.ascoltatore.subscribe("hello", function (topic, message, options) {
        expect(options.mosca.packet).to.have.property("messageId", messageId);
        expect(options.mosca.client).to.have.property("user", "matteo");
        client.disconnect();
      });

      var options = buildOpts();
      options.username = "matteo";
      options.password = "collina";

      client.connect(options);

      client.on('connack', function(packet) {
        expect(packet.returnCode).to.eql(0);

        client.publish({
          topic: "hello",
          qos: 1,
          payload: "world",
          messageId: messageId
        });
      });
    });
  });

  it("should support authentication (success)", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      expect(username).to.be.eql("matteo");
      expect(password).to.be.eql("collina");
      callback(null, true);
    };

    buildClient(done, function(client) {

      var options = buildOpts();
      options.username = "matteo";
      options.password = "collina";

      client.connect(options);

      client.on('connack', function(packet) {
        expect(packet.returnCode).to.eql(0);
        client.disconnect();
      });
    });
  });

  it("should support authentication (failure)", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      expect(username).to.be.eql("matteo");
      expect(password).to.be.eql("collina");
      callback(null, false);
    };

    buildClient(done, function(client) {

      var options = buildOpts();
      options.username = "matteo";
      options.password = "collina";

      client.connect(options);

      client.on('connack', function(packet) {
        expect(packet.returnCode).to.eql(5);
        client.disconnect();
      });
    });
  });

  it("should support publish authorization (success)", function(done) {
    instance.authorizePublish = function(client, topic, payload, callback) {
      expect(topic).to.be.eql("hello");
      expect(payload).to.be.eql("world");
      callback(null, true);
    };

    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("puback", function(packet) {
        expect(packet).to.have.property("messageId", messageId);
        client.disconnect();
      });

      client.publish({
        topic: "hello",
        qos: 1,
        payload: "world",
        messageId: messageId
      });
    });
  });

  it("should support publish authorization (failure)", function(done) {
    instance.authorizePublish = function(client, topic, payload, callback) {
      expect(topic).to.be.eql("hello");
      expect(payload).to.be.eql("world");
      callback(null, false);
    };

    buildAndConnect(done, function(client) {

      // it exists no negation of auth, it just disconnect the client
      client.publish({
        topic: "hello",
        payload: "world",
        qos: 1,
        messageId: 42
      });
    });
  });

  it("should support publish authorization (success)", function(done) {
    instance.authorizeSubscribe = function(client, topic, callback) {
      expect(topic).to.be.eql("hello");
      callback(null, true);
    };

    buildAndConnect(done, function(client) {

      client.on("suback", function(packet) {
        client.disconnect();
      });

      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      client.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("should support publish authorization (failure)", function(done) {
    instance.authorizeSubscribe = function(client, topic, callback) {
      expect(topic).to.be.eql("hello");
      callback(null, false);
    };

    buildAndConnect(done, function(client) {

      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      // it exists no negation of auth, it just disconnect the client
      client.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });
});
