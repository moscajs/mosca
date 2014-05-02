var mqtt = require("mqtt");
var async = require("async");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");

var moscaSettings = function() {
  return {
    port: nextPort(),
    stats: false,
    persistence: {
      factory: mosca.persistence.Memory
    },
    logger: {
      childOf: globalLogger,
      level: 60
    }
  };
};

describe("mosca.Server", function() {
  abstractServerTests(moscaSettings, mqtt.createConnection);

  function buildClient(instance, done, callback) {
    var client = mqtt.createConnection(instance.opts.port);

    client.once('error', done);
    client.stream.once('close', function() {
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

      client.on('connack', function(packet) {
        callback(client);
      });
    });
  }

  it("should pass mosca options to backend when publishing", function(done) {
    var instance = this.instance;
    buildClient(instance, done, function(client) {

      instance.ascoltatore.subscribe("hello", function (topic, message, options) {
        expect(options).to.have.property("messageId");
        expect(options).to.have.property("qos", 1);
        client.disconnect();
      });

      client.connect(buildOpts());

      client.on('connack', function(packet) {
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
        expect(packet.payload).to.equal("some other data");
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

    async.parallel(instances.map(function(i) {
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
    var client = mqtt.createConnection(settings.port, settings.host);

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

      client.connect(opts);

      client.on('connack', function(packet) {
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
      mqtt: require("mqtt"),
      wildcardSome: '#',
      wildcardOne: '+'
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

  it("should support subscribing correctly to wildcards in a tree-based topology", function(done) {
    var d = donner(3, done);

    async.waterfall([

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
      host: 'localhost'
    };

    var spy = sinon.spy(newSettings.persistence, 'factory');

    var server = new mosca.Server(newSettings);

    async.series([

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
});
