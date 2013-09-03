var mqtt = require("mqtt");
var async = require("async");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");

var moscaSettings = function() {
  return {
    port: nextPort(),
    logger: {
      childOf: globalLogger,
      level: 60
    }
  };
};

describe("mosca.Server", function() {
  abstractServerTests(moscaSettings, mqtt.createConnection);
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
});
