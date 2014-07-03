var async = require("async");
var mqtt = require("mqtt");
var ascoltatori = require("ascoltatori");
var uuid = require("node-uuid");

module.exports = function(moscaSettings, createConnection) {
  var instance;
  var secondInstance;
  var settings;

  beforeEach(function(done) {
    settings = moscaSettings();
    instance = new mosca.Server(settings, done);
    this.instance = instance;
    this.settings = settings;
    secondInstance = null;
  });

  afterEach(function(done) {
    var instances = [this.instance];

    if (secondInstance) {
      instances.push(secondInstance);
    }

    async.each(instances, function(instance, cb) {
      instance.close(cb);
    }, done);
  });

  function buildClient(done, callback) {
    var client = createConnection(settings.port, settings.host);

    client.once('error', done);
    client.stream.once('close', function() {
      done();
    });

    client.on("connected", function() {
      callback(client);
    });
  }

  function buildAndConnect(done, opts, callback) {

    if (typeof opts === "function") {
      callback = opts;
      opts = buildOpts();
    }

    buildClient(done, function(client) {
      client.opts = opts;

      client.connect(opts);

      client.on('connack', function(packet) {
        callback(client);
      });
    });
  }

  it("should pass itself in the callback", function(done) {
    secondInstance = new mosca.Server(moscaSettings(), function(err, server) {
      expect(server === secondInstance).to.be.true;
      done();
    });
  });

  it("should allow to be called like a function", function(done) {
    var func = mosca.Server;
    secondInstance = func(moscaSettings(), function(err, server) {
      expect(server === secondInstance).to.be.true;
      done();
    });
  });

  it("should support connecting and disconnecting", function(done) {
    buildClient(done, function(client) {

      client.connect(buildOpts());

      client.on('connack', function(packet) {
        client.disconnect();
      });
    });
  });

  it("should support connecting and disconnecting with a zero keepalive", function(done) {
    var client = createConnection(settings.port, settings.host);
    var disconnect = false;

    client.once('error', done);
    client.stream.once('close', function() {
      expect(disconnect).to.be.true;
      done();
    });

    client.on("connected", function() {
      var opts = buildOpts();
      opts.keepalive = 0;

      client.connect(opts);
    });

    client.on("connack", function() {
      setTimeout(function() {
        disconnect = true;
        client.disconnect();
      }, 5);
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

  it("should send a connack packet with returnCode 0 if the clientId is 65535 chars", function(done) {
    buildClient(done, function(client) {

      var opts = buildOpts(), clientId = [];

      for(var i=0; i < 65535; i++) {
        clientId.push("i");
      }
      opts.clientId = clientId.join("");

      client.connect(opts);

      client.on('connack', function(packet) {
        client.disconnect();
        expect(packet.returnCode).to.eql(0);
      });
    });
  });

  it("should send a connack packet with returnCode 0 if the clientId is 1 char", function(done) {
    buildClient(done, function(client) {

      var opts = buildOpts();
      opts.clientId = "i";

      client.connect(opts);

      client.on('connack', function(packet) {
        client.disconnect();
        expect(packet.returnCode).to.eql(0);
      });
    });
  });

  it("should close the first client if a second client with the same clientId connects", function(done) {
    var d = donner(2, done);
    var opts = buildOpts(), clientId = "123456789";
    opts.clientId = clientId;
    async.waterfall([
      function(cb) {
        buildAndConnect(d, opts, function(client1) {
          cb(null, client1);
        });
      }, function(client1, cb) {
        buildAndConnect(d, opts, function(client2) {
          // no need to check if client1 is destroyed
          // if not, this test will timeout
          client2.disconnect();
        });
      }
    ]);
  });

  it("should send a pingresp when it receives a pingreq", function(done) {
    buildAndConnect(done, function(client) {

      client.on("pingresp", function() {
        client.disconnect();
      });

      client.pingreq();
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

  it("should emit an event for each subscribe", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      client.on("suback", function(packet) {
        client.disconnect();
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });

    instance.on("subscribed", function(topic, client) {
      expect(topic).to.eql("hello");
      expect(client).to.exist;
      d();
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

  it("should support publishing big messages", function(done) {
    var d = donner(2, done);
    var bigPayload = new Buffer(5 * 1024);
    bigPayload.fill("42");
    buildAndConnect(d, function(client1) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      client1.on("publish", function(packet) {
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload.length).to.be.equal(bigPayload.length);
        client1.disconnect();
      });

      client1.on("suback", function() {
        buildAndConnect(d, function(client2) {
          client2.publish({
            topic: "hello",
            payload: bigPayload,
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
        client.publish({
          topic: "hello",
          payload: "data" 
        });
        client.disconnect();
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

  it("should unsubscribe from topics with multiple wildcards", function(done) {
    buildAndConnect(done, function(client) {

      client.on("publish", function(packet) {
        client.disconnect();
        throw new Error("a message could not have been published");
      });

      client.on("unsuback", function(packet) {
        client.publish({
          topic: "hello/foo/there/bar",
          payload: "data" 
        });
        client.disconnect();
      });

      client.on("suback", function(packet) {
        client.unsubscribe({
          unsubscriptions: ["hello/#/there/#"],
          messageId: messageId
        });
      });

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello/#/there/#",
          qos: 1
        }
      ];
      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should emit an event for each unsubscribe", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];


      client.on("unsuback", function(packet) {
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

    instance.on("unsubscribed", function(topic, client) {
      expect(topic).to.eql("hello");
      expect(client).to.exist;
      d();
    });
  });

  it("should emit an event for unsubscribe without subscribe", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      client.on("unsuback", function(packet) {
        client.disconnect();
      });

      client.unsubscribe({
        unsubscriptions: ["hello"],
        messageId: messageId
      });

    });

    instance.on("unsubscribed", function(topic, client) {
      expect(topic).to.eql("hello");
      expect(client).to.exist;
      d();
    });

  });

  it("should emit an event on every newly published packet", function(done) {
    buildAndConnect(done, function(client) {

      var clientId = client.opts.clientId;

      instance.on("published", function(packet, serverClient) {
        expect(packet.topic).to.be.equal("hello");
        expect(packet.payload.toString()).to.be.equal("some data");
        expect(serverClient.id).to.be.equal(clientId);
        client.disconnect();
      });

      client.publish({
        topic: "hello",
        payload: "some data"
      });
    });
  });

  it("should call onPublished on every newly published packet", function(done) {
    var onPublishedCalled = false;
    var clientId;

    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;

      expect(packet.topic).to.be.equal("hello");
      expect(packet.payload.toString()).to.be.equal("some data");
      expect(serverClient.id).to.be.equal(clientId);

      callback();
    };

    buildAndConnect(done, function(client) {
      clientId = client.opts.clientId;

      client.publish({
        messageId: 42,
        topic: "hello",
        payload: "some data",
        qos: 1
      });

      client.on("puback", function() {
        expect(onPublishedCalled).to.eql(true);
        client.disconnect();
      });
    });
  });

  it("should emit an event when a new client is connected", function(done) {
    buildClient(done, function(client) {

      instance.on("clientConnected", function(serverClient) {
        expect(serverClient).not.to.be.equal(undefined);
        client.stream.end();
      });

      client.connect(buildOpts());
    });
  });

  it("should emit an event when a client is disconnected", function(done) {
    var client = createConnection(settings.port, settings.host);

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

  it("should emit only once clientDisconnected event per client", function(done) {
    var client = createConnection(settings.port, settings.host);

    instance.on('clientDisconnected', function(serverClient) {
      done();
    });

    client.on('error', done);

    client.on('connack', function() {
      client.disconnect();
      client.disconnect();
      client.stream.end();
    });

    client.connect(buildOpts());
  });

  it("should emit an event when a client is disconnected without a disconnect", function(done) {
    var client = createConnection(settings.port, settings.host);

    instance.on('clientDisconnected', function(serverClient) {
      expect(serverClient).not.to.be.equal(undefined);
      done();
    });

    client.on('error', done);

    client.on('connack', function() {
      client.stream.end();
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
        server.on("closed", cb);
        server.close();
      }
    ], done);
  });

  it("should support subscribing to # wildcard", function(done) {
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

  it("should support subscribing to + wildcard", function(done) {
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
          topic: "hello/+",
          qos: 0
        }
      ];
      client1.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
  });

  it("should support subscribing to topics with multiple wildcards", function(done) {
    var d = donner(2, done);
    buildAndConnect(d, function(client1) {

      client1.on("publish", function(packet) {
        expect(packet.topic).to.be.equal("hello/foo/world/bar");
        expect(packet.payload).to.be.equal("some data");
        client1.disconnect();
      });

      client1.on("suback", function() {
        buildAndConnect(d, function(client2) {
          client2.publish({
            topic: "hello/foo/world/bar",
            payload: "some data"
          });
          client2.disconnect();
        });
      });

      var subscriptions = [{
          topic: "hello/#/world/#",
          qos: 0
        }
      ];
      client1.subscribe({
        subscriptions: subscriptions,
        messageId: 42
      });
    });
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

  function maxInflightMessageTest(max, done) {
    buildAndConnect(done, function (client) {

      var counter = max + 1;

      function doPublish() {
        if (counter-- === 0) {
          return;
        }

        client.publish({
          topic: "hello/foo",
          qos: 1,
          messageId: counter
        });

        setImmediate(doPublish);
      }

      // we are not replaying with any pubacks

      client.on("suback", function(packet) {
        doPublish();
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
  }

  it("should disconnect a client if it has more thant 1024 inflight messages", function (done) {
    maxInflightMessageTest(1024, done);
  });

  it("should have the max inflight message limit configurable", function (done) {
    var that = this;
    instance.close(function() {
      settings.maxInflightMessages = 512;
      that.instance = new mosca.Server(settings, function() {
        maxInflightMessageTest(512, done);
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
        var client = createConnection(settings.port, settings.host);

        client.on("connected", function() {
          var opts = buildOpts();
          opts.clientId = 'client1';
          opts.will = {
            topic: "hello/died",
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
            topic: "hello/died",
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
            topic: "hello/died",
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
          expect(packet.topic).to.be.eql("hello/died");
          expect(packet.payload).to.be.eql("client1 died");
          client3.disconnect();
        });
      }
    ]);
  });

  it("should support authentication (success)", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      expect(username.toString()).to.be.eql("matteo");
      expect(password.toString()).to.be.eql("collina");
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
      expect(username.toString()).to.be.eql("matteo");
      expect(password.toString()).to.be.eql("collina");
      callback(null, false);
    };

    buildClient(done, function(client) {

      var options = buildOpts();
      options.username = "matteo";
      options.password = "collina";

      client.connect(options);

      client.on('connack', function(packet) {
        expect(packet.returnCode).to.eql(5);
      });
    });
  });

  it("should support authentication (error)", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      callback(new Error("auth error"));
    };

    buildClient(done, function(client) {

      var options = buildOpts();
      options.username = "matteo";
      options.password = "collina";

      client.connect(options);

      client.on('connack', function(packet) {
        expect(packet.returnCode).to.eql(4);
      });
    });
  });

  it("should support publish authorization (success)", function(done) {
    instance.authorizePublish = function(client, topic, payload, callback) {
      expect(topic).to.be.eql("hello");
      expect(payload.toString()).to.be.eql("world");
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
      expect(payload.toString()).to.be.eql("world");
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

  it("should support overriding the payload during authorization", function(done) {
    instance.authorizePublish = function(client, topic, payload, callback) {
      callback(null, new Buffer("rewritten"));
    };

    instance.on("published", function(packet) {
      expect(packet.payload.toString()).to.be.equal("rewritten");
    });

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

  it("should share the authenticated client during the publish authorization", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      client.shared = 'message';
      callback(null, true);
    };

    instance.authorizePublish = function(client, topic, payload, callback) {
      expect(client).to.have.property("shared", "message");
      callback(null, true);
    };

    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());

      client.on("puback", function(packet) {
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

  it("should support subscribe authorization (success)", function(done) {
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

  it("should support subscribe authorization (failure)", function(done) {
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

  it("should share the authenticated client during the subscribe authorization", function(done) {
    instance.authenticate = function(client, username, password, callback) {
      client.shared = "message";
      callback(null, true);
    };

    instance.authorizeSubscribe = function(client, topic, callback) {
      expect(client).to.have.property("shared", "message");
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

  it("should support retained messages", function(done) {

    async.waterfall([

      function(cb) {
        var client = createConnection(settings.port, settings.host);

        client.on("connected", function() {
          var opts = buildOpts();

          client.connect(opts);

          client.on('connack', function(packet) {
            client.publish({
              topic: "hello",
              qos: 1,
              payload: new Buffer("world world"),
              messageId: 42,
              retain: true
            });
          });

          client.on('puback', function() {
            client.stream.end();
            cb();
          });
        });
      },

      function(cb) {
        var client = createConnection(settings.port, settings.host);

        client.on("connected", function() {
          var opts = buildOpts();

          client.connect(opts);

          client.on('connack', function(packet) {
            var subscriptions = [{
              topic: "hello",
              qos: 0
            }];

            client.subscribe({
              subscriptions: subscriptions,
              messageId: 29
            });
          });

          client.on("publish", function(packet) {
            expect(packet.topic).to.be.eql("hello");
            expect(packet.payload.toString()).to.be.eql("world world");
            client.stream.end();
            cb();
          });
        });
      }
    ], done);
  });

  it("should return only a single retained message", function(done) {

    async.waterfall([

      function(cb) {
        buildClient(cb, function(client) {

          client.name = "Phase 1";
          var defaultMessage = {
            topic: "hello",
            qos: 1,
            payload: null,
            messageId: null,
            retain: true
          };

          var opts = buildOpts();
          opts.clean = true;

          var totalMessages = 3;
          var publishCount = 0;

          client.connect(opts);

          client.on('puback', function(packet){
            publishCount++;
            if(publishCount == totalMessages) {
              client.stream.end();
            }
          });

          client.on('connack', function(packet) {
            for(var c = 1; c <= totalMessages; c++) {
              defaultMessage.payload = (c == totalMessages) ? new Buffer("Final Message") : new Buffer("Message " + c);
              defaultMessage.messageId = 40 + c;
              client.publish(defaultMessage);
            }
          });
        });
      },

      function(cb) {
        setTimeout(cb, 100);
      },

      function(cb) {
        buildClient(cb, function(client) {
          var retainedReceivedCount = 0;

          var opts = buildOpts();
          opts.clean = true;

          client.connect(opts);

          client.on("connack", function(packet) {
            var subscriptions = [{
              topic: "hello",
              qos: 0
            }];

            client.subscribe({
              subscriptions: subscriptions,
              messageId: 20
            });
          });

          var handleTimeout = function() {
            expect(retainedReceivedCount).to.be.equal(1);
            client.stream.end();
          };

          var timeout;

          client.on("publish", function(packet) {
            clearTimeout(timeout);
            timeout = setTimeout(handleTimeout, 100);
            retainedReceivedCount++;
          });
        });
      }
    ], done);
  });

  it("should restore subscriptions for uncleaned clients", function(done) {
    var opts = buildOpts();

    opts.clientId = "mosca-unclean-clients-test";
    opts.clean = false;

    async.series([

      function(cb) {
        buildAndConnect(cb, opts, function(client) {
          var subscriptions = [{
            topic: "hello",
            qos: 1
          }];

          client.subscribe({
            subscriptions: subscriptions,
            messageId: 42
          });

          client.on("suback", function() {
            client.stream.end();
          });
        });
      },

      function(cb) {
        buildAndConnect(cb, opts, function(client) {
          client.publish({
            topic: "hello",
            qos: 1,
            payload: "world",
            messageId: 42
          });

          client.on("publish", function(packet) {
            expect(packet.topic).to.be.eql("hello");
            expect(packet.payload).to.be.eql("world");
            expect(packet.qos).to.be.eql(1);
            client.disconnect();
          });
        });
      }
    ], done);
  });

  it("should restore subscriptions for uncleaned clients (bis)", function(done) {
    var opts = buildOpts();

    opts.clientId = "mosca-unclean-client-test";
    opts.clean = false;

    async.series([

      function(cb) {
        buildAndConnect(cb, opts, function(client) {
          var subscriptions = [{
            topic: "hello",
            qos: 1
          }];

          client.subscribe({
            subscriptions: subscriptions,
            messageId: 42
          });

          client.on("suback", function() {
            client.stream.end();
          });
        });
      },

      function(cb) {
        buildAndConnect(cb, buildOpts(), function(client) {
          client.publish({
            topic: "hello",
            qos: 1,
            payload: "world",
            messageId: 24
          });
          client.on("puback", function() {
            client.disconnect();
          });
        });
      },

      function(cb) {
        buildAndConnect(cb, opts, function(client) {
          client.on("publish", function(packet) {
            expect(packet.topic).to.be.eql("hello");
            expect(packet.payload).to.be.eql("world");
            client.disconnect();
          });
        });
      }
    ], done);
  });

  it("should remove already pubacked messages from the offline store", function(done) {
    var opts = buildOpts();

    opts.clientId = "mosca-unclean-clients-test";
    opts.clean = false;
    opts.keepalive = 0;

    function step1(cb) {
      buildAndConnect(function() {}, opts, function(client) {
        var subscriptions = [{
          topic: "hello",
          qos: 1
        }];

        client.subscribe({
          subscriptions: subscriptions,
          messageId: 42
        });

        client.on("suback", function() {
          cb(null, client);
        });
      });
    }

    function step2(subscriber, cb) {
      buildAndConnect(function() {}, buildOpts(), function(client) {
        cb(null, subscriber, client);
      });
    }

    function step3(subscriber, publisher, cb) {
      publisher.publish({
        topic: "hello",
        qos: 1,
        payload: "world",
        messageId: 42
      });

      publisher.on("puback", function(packet) {
        publisher.disconnect();
      });

      subscriber.on("publish", function(packet) {
        subscriber.puback({ messageId: packet.messageId });
        subscriber.disconnect();
        cb();
      });
    }

    async.waterfall([
      step1, step2, step3,
      // two times!
      step1, step2, step3
    ], function(err) {

      expect(err).to.be.falsy;

      buildClient(done, function(client) {
        client.connect(opts);

        client.on("publish", function(packet) {
          done(new Error("not expected"));
        });

        setTimeout(function() {
          client.disconnect();
        }, 100);
      });
    });
  });

  it("should support offline messaging", function(done) {
    var opts = buildOpts();

    opts.clientId = "mosca-unclean-clients-test2";
    opts.clean = false;
    opts.keepalive = 0;

    async.series([

      function(cb) {
        buildAndConnect(cb, opts, function(client) {
          var subscriptions = [{
            topic: "hello",
            qos: 1
          }];

          client.subscribe({
            subscriptions: subscriptions,
            messageId: 42
          });

          client.on("suback", function() {
            client.disconnect();
          });
        });
      },

      function(cb) {
        buildClient(cb, function(client) {
          client.connect(buildOpts());

          client.publish({
            topic: "hello",
            qos: 1,
            payload: "world",
            messageId: 42
          });

          client.on("puback", function(packet) {
            client.disconnect();
          });
        });
      },

      function(cb) {
        buildAndConnect(cb, opts, function(client) {

          client.on("publish", function(packet) {
            client.puback({ messageId: packet.messageId });
            client.disconnect();

            expect(packet.topic).to.eql("hello");
            expect(packet.payload).to.eql("world");
            expect(packet.qos).to.eql(1);
          });
        });
      }
    ], done);
  });

  describe("pattern matching", function() {

    var buildTest = function(subscribed, published, expected) {
      var not = "";

      if (expected === undefined) {
        expected = true;
      }

      if (!expected) {
        not = "not ";
      }

      if (!(subscribed instanceof Array)) {
        subscribed = [subscribed];
      }

      it("should " + not + "support forwarding to " + subscribed + " when publishing " + published, function(done) {
        var d = donner(2, done);
        buildAndConnect(d, function(client1) {

          var messageId = Math.floor(65535 * Math.random());
          var subscriptions = subscribed.map(function(topic) {
            return {
              topic: topic,
              qos: 0
            };
          });

          client1.on("publish", function(packet) {
            client1.disconnect();
            if (!expected) {
              throw new Error("the message was not expected");
            }
          });

          client1.on("suback", function() {
            buildAndConnect(d, function(client2) {
              client2.publish({
                topic: published,
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

          if (!expected) {
            setTimeout(function() {
              client1.disconnect();
            }, 50);
          }
        });
      });
    };

    buildTest("#", "test/topic");
    buildTest("#", "/test/topic");
    buildTest("foo/#", "foo/bar/baz");
    buildTest("foo/+/baz", "foo/bar/baz");
    buildTest("foo/#", "foo");
    buildTest("/#", "/foo");
    buildTest("test/topic/", "test/topic");
    buildTest("+/+/+/+/+/+/+/+/+/+/test", "one/two/three/four/five/six/seven/eight/nine/ten/test");
    buildTest("/test/topic", "test/topic", false);
    buildTest("/test//topic", "/test/topic");
    buildTest("/test//topic", "/test//topic");
    buildTest("/test/+/topic", "/test//topic", false);
    buildTest("#", "$SYS/hello", false);
    buildTest("/#", "$SYS/hello", false);
    buildTest("/+/hello", "$SYS/hello", false);
    buildTest("$SYS/hello", "$SYS/hello");
    buildTest("$SYS/hello", "$SYS/hello");
    buildTest(["#", "$SYS/#"], "$SYS/hello");
  });

  it("should allow plugin authors to publish", function(done) {
    buildAndConnect(done, function(client) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      client.on("suback", function(packet) {
        instance.publish({ topic: "hello", payload: "world", qos: 1 });
      });

      client.on("publish", function(packet) {
        expect(packet).to.have.property("topic", "hello");
        expect(packet).to.have.property("payload", "world");
        expect(packet).to.have.property("qos", 1);
        client.disconnect();
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should have an id which is a truncated uuid by default", function() {
    // validate an uuid with a mirror test
    var id = uuid.unparse(uuid.parse(instance.id));
    expect(id).to.eql(instance.id + "-0000-0000-0000-000000000000");
  });

  it("should have a configurable id", function(done) {
    var newSettings = moscaSettings();
    newSettings.id = "4242";
    secondInstance = new mosca.Server(newSettings, done);
    expect(secondInstance.id).to.eql("4242");
  });
};
