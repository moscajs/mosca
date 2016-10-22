var steed = require("steed");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");
var net = require("net");
var createConnection = require("./helpers/createConnection");

var moscaSettings = function() {
  return {
    port: nextPort(),
    stats: false,
    publishNewClient: false,
    persistence: {
      factory: mosca.persistence.Memory
    },
    logger: {
      level: "error"
    }
  };
};

describe("mosca.Server", function() {
  abstractServerTests(moscaSettings, createConnection);

  function buildClient(instance, done, callback) {
    var client = createConnection(instance.opts.port);

    client.once("error", done);
    client.stream.once("close", function() {
      done();
    });

    client.on("connected", function() {
      callback(client);
    });
  }

  function buildAndConnect(done, instance, opts, callback) {

    if (typeof opts === "function") {
      callback = opts;
      opts = buildOpts();
    }

    buildClient(instance, done, function(client) {
      client.opts = opts;

      client.connect(opts);

      client.on("connack", function(packet) {
        callback(client);
      });
    });
  }

  it("should close twice", function(done) {
    this.instance.close(done);
  });

  it("should not emit \"clientDisconnected\" for a non-mqtt client", function(done) {
    var stream = net.connect({ port: this.settings.port });

    this.instance.on("clientDisconnected", done);

    stream.on("connect", function() {
      stream.end();
      done();
    });

    stream.on("error", function(err) {
      // swallow errors
    });
  });

  it("should emit \"pingreq\" of the corresponding client at a pingreq", function(done) {

    var instance = this.instance;
    buildClient(instance, done, function(client) {

      var clientId = 'client';
      var opts = buildOpts();
      opts.clientId = clientId;

      client.connect(opts);

      instance.on('pingreq', function(c){
        expect(c.id).to.equal(clientId);
        client.disconnect();
      });

      client.pingreq();

    });
  });

  it("should pass mosca options to backend when publishing", function(done) {
    var instance = this.instance;
    buildClient(instance, done, function(client) {

      instance.ascoltatore.subscribe("hello", function (topic, message, options) {
        expect(options).to.have.property("messageId");
        expect(options).to.have.property("qos", 1);
        client.disconnect();
      });

      client.connect(buildOpts());

      client.on("connack", function(packet) {
        expect(packet.returnCode).to.eql(0);

        var messageId = Math.floor(65535 * Math.random());

        client.publish({
          topic: "hello",
          qos: 1,
          payload: "world",
          messageId: messageId
        });
      });
    });
  });

  it("should support subscribing with overlapping topics and receiving message only once", function(done) {
    var d = donner(2, done);
    var that = this;
    buildAndConnect(d, this.instance, buildOpts(), function(client1) {

      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "a/+",
          qos: 1
        }, {
          topic: "+/b",
          qos: 1
        }, {
          topic: "a/b",
          qos: 1
        }
      ];
      var called = 0;

      client1.on("publish", function(packet) {
        client1.puback({ messageId: packet.messageId });
        expect(packet.topic).to.equal("a/b");
        expect(packet.payload.toString()).to.equal("some other data");
        expect(called++).to.equal(0);
      });

      client1.on("suback", function() {
        buildAndConnect(d, that.instance, buildOpts(), function(client2) {

          client2.on("puback", function() {
            client1.disconnect();
            client2.disconnect();
          });

          client2.publish({
            topic: "a/b",
            payload: "some other data",
            messageId: messageId,
            qos: 1
          });
        });
      });

      client1.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should not receive the publish after unsubscription, while multi subscriptions with the same topic", function(done) {

    // Simulate a situation that it takes same time to do authorizeSubscribe.
    this.instance.authorizeSubscribe = function(client, topic, callback) {
      setTimeout(function(){
        callback(null, true);
      }, 300);
    };

    buildAndConnect(function(){}, this.instance, function(client) {
        function subAction(){
          var messageId = Math.floor(65535 * Math.random());
          client.subscribe({
            subscriptions: [{topic: "hello", qos: 1 }],
            messageId: messageId
          });
        }

        var subCount = 3;  // subscribe the same topic for 3 times
        for (var i = 0; i < subCount; ++i)
          subAction();

        var subackCount = 0;
        client.on("suback", function() { // unsubscribe after subscriptions
          subackCount++;
          if (subackCount == subCount) { 
            var messageId = Math.floor(65535 * Math.random());
            client.unsubscribe({
              unsubscriptions: ["hello"],
              messageId: messageId
            });
          }
        });

        client.on("unsuback", function() { // publish message after unsubscription
          var messageId = Math.floor(65535 * Math.random());
          client.publish({
            topic: "hello",
            payload: "some data",
            messageId: messageId,
            qos: 1
          });
        });

        client.on("publish", function(packet) { // should not receive the publish
          done(new Error("unexpected publish"));
        });

        client.on("puback", function(packet) { // close client when puback
          client.disconnect();
          done();
        });
    });
  });

  it("should fail if persistence can not connect", function (done) {
    var newSettings = moscaSettings();

    newSettings.persistence = {
      factory: mosca.persistence.Mongo,
      url: "mongodb://someUrlCannotConnect"
    };

    var server = new mosca.Server(newSettings, function (err) {
      if (err instanceof Error) {
        done();
      } else {
        expect().fail("new mosca.Server should fail");
      }
    });
  });

  it("should support subscribing via server.subscribe", function(done) {
    var that = this;
    buildAndConnect(done, this.instance, buildOpts(), function(client) {

      that.instance.subscribe('a/+', function(topic, payload){
        expect(topic).to.be.equal('a/b');
        expect(payload.toString()).to.be.equal('some data');
        client.disconnect();
      }, function(){
        var messageId = Math.floor(65535 * Math.random());
        client.publish({
          topic: "a/b",
          payload: "some data",
          messageId: messageId,
          qos: 1
        });
      });
    });
  });

  it("should provide packet in publish callback", function(done) {
    var messageId;

    this.instance.once("published", function(packet) {
      messageId = packet.messageId;
    });
	
    this.instance.publish({
      topic: "hello",
      payload: "some data"
    }, function(error, packet) {
      expect(packet.topic).to.be.equal("hello");
      expect(packet.payload.toString().toString()).to.be.equal("some data");
      expect(packet.messageId.toString()).to.equal(messageId);
      done();
    });
  });

  describe("timers", function() {
    var clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      clock.restore();
    });

    function fastForward(increase, max) {
      clock.tick(increase);
      if (increase < max) {
        setImmediate(fastForward.bind(null, increase, max - increase));
      }
    }

    it("should close the connection after the keepalive interval", function(done) {
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;
        var timer = Date.now();

        var opts = buildOpts();
        opts.keepalive = keepalive;

        client.connect(opts);

        client.stream.on("close", function() {
          var interval = (Date.now() - timer) / 1000;
          expect(interval).to.be.least(keepalive * 3 / 2);
        });

        fastForward(100, 4000);
      });
    });

    it("should correctly renew the keepalive window after a pingreq", function(done) {
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;
        var timer = Date.now();

        var opts = buildOpts();
        opts.keepalive = keepalive;

        client.connect(opts);

        client.stream.on("close", function() {
          var interval = (Date.now() - timer) / 1000;
          expect(interval).to.be.least(keepalive + keepalive / 2);
        });

        setTimeout(function() {
          client.pingreq();
        }, keepalive * 1000 / 2);

        fastForward(100, 4000);
      });
    });

    it("should correctly renew the keepalive window after a subscribe", function(done) {
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;
        var timer = Date.now();

        var opts = buildOpts();
        opts.keepalive = keepalive;

        var messageId = Math.floor(65535 * Math.random());
        var subscriptions = [{
            topic: "hello",
            qos: 0
          }
        ];

        client.connect(opts);

        client.stream.on("close", function() {
          var interval = (Date.now() - timer) / 1000;
          expect(interval).to.be.least(keepalive + keepalive / 2);
        });

        setTimeout(function() {
          client.subscribe({
            subscriptions: subscriptions,
            messageId: messageId
          });
        }, keepalive * 1000 / 2);

        fastForward(100, 4000);
      });
    });

    it("should correctly renew the keepalive window after a publish", function(done) {
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;
        var timer = Date.now();

        var opts = buildOpts();
        opts.keepalive = keepalive;

        var messageId = Math.floor(65535 * Math.random());

        client.connect(opts);

        client.stream.on("close", function() {
          var interval = (Date.now() - timer) / 1000;
          expect(interval).to.be.least(keepalive + keepalive / 2);
        });

        setTimeout(function() {
          client.publish({
            topic: "hello",
            payload: "some data",
            messageId: messageId
          });
        }, keepalive * 1000 / 2);

        fastForward(100, 4000);
      });
    });

    it("should correctly renew the keepalive window after a puback", function(done) {
      var instance = this.instance;
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;

        var opts = buildOpts();
        opts.keepalive = keepalive;
        var closed = false;
        var timer;

        var messageId = Math.floor(65535 * Math.random());
        var subscriptions = [{
            topic: "hello",
            qos: 1
          }
        ];

        client.connect(opts);

        client.on("connack", function() {
          client.subscribe({
            subscriptions: subscriptions,
            messageId: messageId
          });
        });

        client.on("suback", function() {
          timer = Date.now();
          instance.publish({ topic: "hello", payload: "world" });
        });

        client.stream.on("close", function() {
          closed = true;
          var interval = (Date.now() - timer) / 1000;
          expect(interval).to.be.least(keepalive + keepalive / 2);
        });

        client.on("publish", function(packet) {
          if (closed) {
            return;
          }

          setTimeout(function() {
            client.puback({ messageId: packet.messageId });
          }, keepalive * 1000 / 2);
        });

        fastForward(50, 3000);
      });
    });

    it("should correctly renew the keepalive window after an unsubscribe", function(done) {
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;
        var timer = Date.now();

        var opts = buildOpts();
        opts.keepalive = keepalive;

        var messageId = Math.floor(65535 * Math.random());
        var subscriptions = [{
            topic: "hello",
            qos: 0
          }
        ];

        client.connect(opts);
        client.subscribe({
          subscriptions: subscriptions,
          messageId: messageId
        });

        client.stream.on("close", function() {
          var interval = (Date.now() - timer) / 1000;
          expect(interval).to.be.least(keepalive + keepalive / 2);
        });

        setTimeout(function() {
          client.unsubscribe({
            unsubscriptions: ["hello"],
            messageId: messageId
          });
        }, keepalive * 1000 / 2);

        fastForward(100, keepalive * 2 * 1000);
      });
    });

    it("should allow unsubscription without any subscriptions", function(done) {
      buildClient(this.instance, done, function(client) {
        var keepalive = 1;
        var timer = Date.now();

        var opts = buildOpts();
        opts.keepalive = keepalive;

        var messageId = Math.floor(65535 * Math.random());
        var subscriptions = [{
            topic: "hello",
            qos: 0
          }
        ];
        client.connect(opts);

        client.unsubscribe({
            unsubscriptions: ["hello"],
            messageId: messageId
          });

        fastForward(100, keepalive * 2 * 1000);
      });
    });

  });

  describe("stats", function() {
    var clock;
    var stats;

    beforeEach(function(done) {
      clock = sinon.useFakeTimers();
      var that = this;
      this.instance.close(function() {
        that.settings = moscaSettings();
        that.settings.stats = true;
        that.instance = new mosca.Server(that.settings, done);
        stats = that.instance.stats;
      });
    });

    afterEach(function(done) {
      clock.restore();
      this.instance.close(done);
    });

    it("should maintain a counter of all connected clients", function(done) {
      var d = donner(2, done);
      var instance = this.instance;
      buildAndConnect(d, instance, function(client1) {
        expect(stats.connectedClients).to.eql(1);
        buildAndConnect(d, instance, function(client2) {
          // disconnect will happen after the next tick, has it"s an I/O operation
          client1.disconnect();
          client2.disconnect();
          expect(stats.connectedClients).to.eql(2);
        });
      });
    });

    it("should maintain a counter of all connected clients (bis)", function(done) {
      var d = donner(2, done);
      var instance = this.instance;
      buildAndConnect(d, instance, function(client1) {
        buildAndConnect(d, instance, function(client2) {
          // disconnect will happen after the next tick, has it"s an I/O operation
          client2.disconnect();
        });
        instance.once("clientDisconnected", function() {
          client1.disconnect();
          expect(stats.connectedClients).to.eql(1);

          instance.once("clientDisconnected", function() {
            expect(stats.connectedClients).to.eql(0);
          });
        });
      });
    });

    it("should maintain a counter of all published messages", function(done) {
      buildAndConnect(done, this.instance, function(client1) {
        expect(stats.publishedMessages).to.eql(0);

        client1.publish({
          topic: "hello",
          payload: "some data",
          messageId: 42,
          qos: 1
        });

        client1.on("puback", function() {
          client1.disconnect();
          expect(stats.publishedMessages).to.eql(1);
        });
      });
    });

    it("should publish data each minute", function(done) {
      var instance = this.instance;
      buildAndConnect(done, instance, function(client1) {
        var topic = "$SYS/" + instance.id + "/clients/connected";
        instance.ascoltatore.subscribe(topic, function callback(topic, value) {
          expect(value).to.eql("1");
          client1.disconnect();
          instance.ascoltatore.unsubscribe(topic, callback);
        });
        clock.tick(60 * 1000);
      });
    });

  });
});

// Move these tests back to abstract_server after ascoltatori change made to support MqttSecureClient
describe("mosca.Server - MQTT backend", function() {
  var instance;
  var secondInstance;
  var settings;

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

    steed.parallel(instances.map(function(i) {
      return function(cb) {
        i.close(cb);
      };
    }), function() {
      done();
      instance = null;
      secondInstance = null;
    });
  });

  function buildClient(done, callback) {
    var client = createConnection(settings.port);

    client.once("error", done);
    client.stream.once("close", function() {
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

      client.connect(opts);

      client.on("connack", function(packet) {
        callback(client);
      });
    });
  }

  it("should pass the backend settings to ascoltatori.build", function(done) {
    var spy = sinon.spy(ascoltatori, "build");
    var newSettings = moscaSettings();

    newSettings.backend = {
      type: "mqtt",
      json: false,
      port: settings.port,
      keepalive: 3000,
      host: "127.0.0.1",
      hostname: "127.0.0.1",
      mqtt: require("mqtt"),
      clientId: "myclientid",
      clean: true,
      protocol: "mqtt",
      protocolId: "MQTT",
      connectTimeout: 30000,
      reconnectPeriod: 1000,
      reschedulePings: true,
      wildcardSome: "#",
      wildcardOne: "+",
      protocolVersion: 4
    };

    var server = new mosca.Server(newSettings);

    steed.series([

      function(cb) {
        server.on("ready", cb);
      },

      function(cb) {
        // because of a spurious "encoding" property in MQTT.js
        expect(spy).to.have.been.calledWith(newSettings.backend);
        cb();
      },

      function(cb) {
        server.close(cb);
      }
    ], done);
  });

  it("should support subscribing correctly to wildcards in a tree-based topology", function(done) {
    var d = donner(3, done);

    steed.waterfall([

      function(cb) {
        settings.backend = {
          port: settings.port,
          type: "mqtt"
        };
        settings.port = nextPort();
        secondInstance = new mosca.Server(settings, function() {
          cb();
        });
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

    steed.waterfall([

      function(cb) {
        buildAndConnect(d, function(client1) {
          cb(null, client1);
        });
      },

      function(client1, cb) {
        client1.on("publish", function(packet) {
          expect(packet.payload.toString()).to.be.eql("some data");
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
        secondInstance = new mosca.Server(settings, function() {
          cb();
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

  it("should build the correct persistence", function(done) {
    var newSettings = moscaSettings();

    newSettings.persistence = {
      factory: mosca.persistence.Redis,
      port: 6379,
      host: "localhost"
    };

    var spy = sinon.spy(newSettings.persistence, "factory");

    var server = new mosca.Server(newSettings);

    steed.series([

      function(cb) {
        server.on("ready", cb);
      },

      function(cb) {
        expect(spy).to.have.been.calledWith(newSettings.persistence);
        cb();
      },

      function(cb) {
        server.close(cb);
      }
    ], done);
  });

  it("should build the correct persistence with string", function(done) {
    var newSettings = moscaSettings();

    newSettings.persistence = {
      factory: "redis",
      port: 6379,
      host: "localhost"
    };

    var server = new mosca.Server(newSettings);

    steed.series([

      function(cb) {
        server.on("ready", cb);
      },

      function(cb) {
        expect(server.persistence.constructor).to.match(/RedisPersistence/);
        cb();
      },

      function(cb) {
        server.close(cb);
      }
    ], done);
  });

  it("should fail if persistence string is not correct", function(done) {
    var newSettings = moscaSettings();

    newSettings.persistence = {
      factory: "no_such_persistence",
      port: 6379,
      host: "localhost"
    };

    var server = new mosca.Server(newSettings, function(err) {
      if(err instanceof Error) {
        done();
      } else {
        expect().fail("new mosca.Server should fail");
      }
    });
  });


});
