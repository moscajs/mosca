var steed = require("steed");
var ascoltatori = require("ascoltatori");

module.exports = function(moscaSettings, createConnection) {
  var instance;
  var secondInstance;
  var settings;

  beforeEach(function(done) {
    settings = moscaSettings();
    settings.publishNewClient = false;
    settings.publishClientDisconnect = false;
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

    steed.each(instances, function(instance, cb) {
      instance.close(cb);
    }, function() {
      setImmediate(done);
    });
  });

  function buildClient(done, callback) {
    var client = createConnection(settings.port, settings.host);

    client.once('error', finish);
    client.stream.once('close', finish);

    client.on("connected", function() {
      callback(client);
    });

    function finish () {
      client.removeListener('error', finish);
      client.stream.removeListener('close', finish);
      done();
    }
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
        callback(client, packet);
      });
    });
  }

  it("should publish connected client to '$SYS/{broker-id}/new/clients'", function(done) {
    var connectedClient = null,
      publishedClientId = null;

    settings = moscaSettings();
    settings.publishNewClient = true;
    settings.publishClientDisconnect = false;

    function verify() {
      if (connectedClient && publishedClientId) {
        expect(publishedClientId).to.be.equal(connectedClient.opts.clientId);
        connectedClient.disconnect();
      }
    }

    secondInstance = new mosca.Server(settings, function(err, server) {
      server.on("published", function(packet, clientId) {
        expect(packet.topic).to.be.equal("$SYS/" + secondInstance.id + "/new/clients");
        publishedClientId = packet.payload.toString();
        verify();
      });

      buildAndConnect(done, function(client) {
        connectedClient = client;
        verify();
      });
    });
  });

  it("should publish disconnected client to '$SYS/{broker-id}/disconnect/clients'", function(done) {
    var connectedClient = null,
        publishedClientId = null;

    settings = moscaSettings();
    settings.publishNewClient = false;
    settings.publishClientDisconnect = true;

    function verify() {
      if (connectedClient && publishedClientId) {
        expect(publishedClientId).to.be.equal(connectedClient.opts.clientId);
        done();
      }
    }

    secondInstance = new mosca.Server(settings, function(err, server) {
      server.on("published", function(packet, clientId) {
        expect(packet.topic).to.be.equal("$SYS/" + secondInstance.id + "/disconnect/clients");
        publishedClientId = packet.payload.toString();
        verify();
      });

      buildAndConnect(function(){}, function(client) {
        connectedClient = client;
        connectedClient.disconnect();
      });
    });
  });

  it("should publish each subscribe to '$SYS/{broker-id}/new/subscribes'", function(done) {
    var d = donner(2, done);
    var connectedClient = null;
    var publishedClientId = null;

    function verify() {
      if (connectedClient && publishedClientId) {
        expect(publishedClientId).to.be.equal(connectedClient.opts.clientId);
        d();
      }
    }

    buildAndConnect(d, function(client) {
      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
          topic: "hello",
          qos: 1
        }
      ];

      connectedClient = client;

      instance.once("published", function(packet) {
        expect(packet.topic).to.be.equal("$SYS/" + instance.id + "/new/subscribes");
        var payload = JSON.parse( packet.payload.toString() );
        publishedClientId = payload.clientId;
        expect(payload.topic).to.be.equal('hello');
        verify();
        client.disconnect();
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });

  });

  it("should publish each unsubscribe to '$SYS/{broker-id}/new/unsubscribes'", function(done) {
    var d = donner(2, done),
        connectedClient = null,
        publishedClientId = null;

    function verify() {
      if (connectedClient && publishedClientId) {
        expect(publishedClientId).to.be.equal(connectedClient.opts.clientId);
        d();
      }
    }

    buildAndConnect(d, function(client) {
      var messageId = Math.floor(65535 * Math.random());
      var subscriptions = [{
        topic: "hello",
        qos: 1
      }];

      connectedClient = client;

      instance.once("published", function(packet) {

        expect(packet.topic).to.be.equal("$SYS/" + instance.id + "/new/subscribes");

        client.unsubscribe({
          unsubscriptions: ["hello"],
          messageId: messageId
        });

        instance.once("published", function(packet) {

          expect(packet.topic).to.be.equal("$SYS/" + instance.id + "/new/unsubscribes");
          var payload = JSON.parse( packet.payload.toString() );
          expect(payload.topic).to.be.equal('hello');
          publishedClientId = payload.clientId;
          verify();

          client.disconnect();
        });
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  describe("multi mosca servers", function() {
    var serverOne = null,
      serverTwo = null,
      clientOpts = buildOpts();

    afterEach(function(done) {
      var instances = [];
      instances.push(serverOne);
      instances.push(serverTwo);

      steed.each(instances, function(instance, cb) {
        if (instance) {
          instance.close(cb);
        } else {
          cb();
        }
      }, function() {
        setImmediate(done);
      });
    });

    it("should disconnect client connected to another broker", function(done) {
      var settingsOne = moscaSettings(),
        settingsTwo = moscaSettings();

      if (!settings.backend || !settings.backend.type) {
        // only need to validate cases with backend
        return done();
      }

      clientOpts.clientId = '123456';
      clientOpts.keepalive = 0;

      settingsOne.publishNewClient = settingsTwo.publishNewClient = true;

      settingsOne.backend = settingsTwo.backend = settings.backend;

      steed.series([
        function(cb) {
          serverOne = new mosca.Server(settingsOne, function(err, server) {
            serverOne.on('clientDisconnected', function(serverClient, reason) {
              expect(reason).to.be.equal('new connection request');
              expect(serverClient).not.to.be.equal(undefined);
              done();
            });
            cb();
          });
        },
        function(cb) {
          serverTwo = new mosca.Server(settingsTwo, function(err, server) {
            cb();
          });
        },
        function(cb) {
          var clientOne = createConnection(settingsOne.port, settingsOne.host);
          clientOne.connect(clientOpts);

          clientOne.on("connected", function() {
            cb();
          });
        },
        function(cb) {
          var clientTwo = createConnection(settingsTwo.port, settingsTwo.host);
          clientTwo.connect(clientOpts);

          clientTwo.on("connected", function() {
            cb();
          });
        }
      ]);
    });

  });

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
    steed.waterfall([
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

  it("should generate a random clientId if none is supplied by the client and protocol is 3.1.1", function(done) {

    var connectedClient = null,
        publishedClientId = null,
        opts = {
          keepalive: 1000,
          clientId: '',
          protocolId: 'MQTT',
          protocolVersion: 4
        };

    settings = moscaSettings();
    settings.publishNewClient = true;
    settings.publishClientDisconnect = false;

    function verify() {
      if (connectedClient && publishedClientId) {
        expect(publishedClientId).to.be.ok;
        connectedClient.disconnect();
      }
    }

    secondInstance = new mosca.Server(settings, function(err, server) {
      server.on("published", function(packet, clientId) {
        expect(packet.topic).to.be.equal("$SYS/" + secondInstance.id + "/new/clients");
        publishedClientId = packet.payload.toString();
        verify();
      });

      buildAndConnect(done, opts, function(client) {
        connectedClient = client;
        verify();
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
        expect(packet.payload.toString()).to.be.equal("some data");
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
        expect(packet.payload.toString().length).to.be.equal(bigPayload.length);
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
        expect(packet.payload.toString().toString()).to.be.equal("some data");
        expect(serverClient.id).to.be.equal(clientId);
        client.disconnect();
      });

      client.publish({
        topic: "hello",
        payload: "some data"
      });
    });
  });

  it("should emit an event for puback of each published packet", function(done) {
    buildAndConnect(done, function(client) {

      var clientId = client.opts.clientId;
      var messageId = Math.floor(65535 * Math.random());

      var subscriptions = [{
        topic: "delivery",
        qos: 1
      }];

      instance.on("delivered", function(packet, serverClient) {
        expect(packet.topic).to.be.equal("delivery");
        expect(packet.payload.toString().toString()).to.be.equal("some data");
        expect(serverClient.id).to.be.equal(clientId);
        client.disconnect();
      });

      instance.on("subscribed", function(topic, serverClient) {
        instance.publish({
          topic: "delivery",
          payload: "some data",
          qos: 1
        });
      });

      client.on("publish", function(packet){
        client.puback({ messageId: packet.messageId });
      });
      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });

    });
  });

  it("should call onPublished on every newly published packet", function(done) {
    var onPublishedCalled = false;
    var clientId;

    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;

      expect(packet.topic).to.be.equal("hello");
      expect(packet.payload.toString().toString()).to.be.equal("some data");
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

  
  // tests for local authorizePublish, with 'ignore' return
  var authorizePublishIgnore = function(client, topic, payload, callback) {
    var auth = true;
    if (topic === 'authignore'){
        auth = 'ignore';
    }
    if (topic === 'authfalse'){
        auth = false;
    }
    
    callback(null, auth);
  };
  
  it("should not call onPublished on publish to topic where auth='ignore'", function(done) {
    var onPublishedCalled = false;
    var clientId;
    var count = 0;

    instance.authorizePublish = authorizePublishIgnore;
    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;
      expect(packet.topic).to.be.equal("hello");
      expect(packet.payload.toString().toString()).to.be.equal("some data");
      expect(serverClient.id).to.be.equal(clientId);

      callback();
    };

    buildAndConnect(done, function(client) {
      clientId = client.opts.clientId;

      client.publish({
        messageId: 42,
        topic: "authignore",
        payload: "some data to ignore",
        qos: 1
      });
      client.publish({
        messageId: 43,
        topic: "hello",
        payload: "some data",
        qos: 1
      });

      // auth='ignore' should puback, but not publish
      client.on("puback", function() {
        count++;
        // on second call, onPublished should be true
        if(count === 2){
            expect(onPublishedCalled).to.eql(true);
            client.disconnect();
        }
      });
    });
  });
  
  it("should disconnect client on publish to topic where auth=false", function(done) {
    var onPublishedCalled = false;
    var clientId;
    var count = 0;
    var timer;

    instance.authorizePublish = authorizePublishIgnore;
    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;
      expect(packet.topic).to.be.equal("should not have published");
      callback();
    };

    buildAndConnect(done, function(client) {
      clientId = client.opts.clientId;

      client.publish({
        messageId: 42,
        topic: "authfalse",
        payload: "some data to cause close",
        qos: 1
      });

      // if after 2 seconds, we've not closed
      timer = setTimeout(function(){
        var test = false;
        expect(count).to.eql(0);
        expect(test).to.eql(true);
        client.disconnect();
      }, 2000);
      
      // auth=false should NOT puback
      client.on("puback", function() {
        expect(onPublishedCalled).to.eql(false);
        count++;
        expect(count).to.eql(0);
        client.disconnect();
      });
      client.on("close", function() {
        expect(onPublishedCalled).to.eql(false);
        expect(count).to.eql(0);
        client.disconnect();
        clearTimeout(timer);
      });
    });
  });

  it("should by default not puback client publish to QOS 2", function(done) {
    var onPublishedCalled = false;
    var clientId;
    var count = 0;
    var timer;

    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;
      expect(packet.topic).to.be.equal("testQOS2");
      callback();
    };

    buildAndConnect(done, function(client) {
      clientId = client.opts.clientId;

      client.publish({
        messageId: 42,
        topic: "testQOS2",
        payload: "publish expected",
        qos: 2
      });

      // allow 1 second to hear puback
      timer = setTimeout(function(){
        client.disconnect();
      }, 1000);
      
      // default QOS 2 should NOT puback
      client.on("puback", function() {
        count++;
        //expect(count).to.eql(1);
        client.disconnect();
      });
      client.on("close", function() {
        expect(count).to.eql(0);
        client.disconnect();
        clearTimeout(timer);
      });
    });
  });

  
  it("should optionally (onQoS2publish='dropToQoS1') puback client publish to QOS 2", function(done) {
    var onPublishedCalled = false;
    var clientId;
    var count = 0;
    var timer;

    instance.onQoS2publish = 'dropToQoS1';
    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;
      expect(packet.topic).to.be.equal("testQOS2");
      callback();
    };

    buildAndConnect(done, function(client) {
      clientId = client.opts.clientId;

      client.publish({
        messageId: 42,
        topic: "testQOS2",
        payload: "publish expected",
        qos: 2
      });

      // allow 1 second to hear puback
      timer = setTimeout(function(){
        client.disconnect();
      }, 1000);
      
      // with maxqos=1, QOS 2 should puback
      client.on("puback", function() {
        count++;
        expect(count).to.eql(1);
        client.disconnect();
      });
      client.on("close", function() {
        expect(count).to.eql(1);
        client.disconnect();
        clearTimeout(timer);
      });
    });
  });

it("should optionally (onQoS2publish='disconnect') disconnect client on publish of QOS2 message", function(done) {
    var onPublishedCalled = false;
    var clientId;
    var count = 0;
    var timer;

    instance.onQoS2publish = 'disconnect';
    instance.published = function(packet, serverClient, callback) {
      onPublishedCalled = true;
      expect(packet.topic).to.be.equal("should not have published");
      callback();
    };

    buildAndConnect(done, function(client) {
      clientId = client.opts.clientId;

      client.publish({
        messageId: 42,
        topic: "QOS2Test",
        payload: "some data to cause close",
        qos: 2
      });

      // if after 2 seconds, we've not closed
      timer = setTimeout(function(){
        var test = false;
        expect(count).to.eql(0);
        expect(test).to.eql(true);
        client.disconnect();
      }, 2000);
      
      // onQoS2publish = 'disconnect' should NOT puback
      client.on("puback", function() {
        expect(onPublishedCalled).to.eql(false);
        count++;
        expect(count).to.eql(0);
        client.disconnect();
      });
      client.on("close", function() {
        expect(onPublishedCalled).to.eql(false);
        expect(count).to.eql(0);
        client.disconnect();
        clearTimeout(timer);
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

    instance.on('clientDisconnected', function(serverClient, reason) {
      expect(reason).to.be.equal('disconnect request');
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
      setImmediate(function() {
        client.stream.end();
      });
    });

    client.connect(buildOpts());
  });

  it("should emit an event when a client is disconnected without a disconnect", function(done) {
    var client = createConnection(settings.port, settings.host);

    instance.on('clientDisconnected', function(serverClient, reason) {
      expect(reason).to.be.equal('close');
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
    steed.series([

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
        expect(packet.payload.toString()).to.be.equal("some data");
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
        expect(packet.payload.toString()).to.be.equal("some data");
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
        expect(packet.payload.toString()).to.be.equal("some data");
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
    var d = donner(3, done);

    steed.waterfall([

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

    steed.waterfall([

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
          expect(packet.payload.toString()).to.be.eql("client1 died");
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
      expect(packet.payload.toString().toString()).to.be.equal("rewritten");
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

  it("should support will authorization (success)", function(done) {
    instance.authorizePublish = function(client, topic, payload, callback) {
      expect(topic).to.be.eql("hello");
      expect(payload.toString()).to.be.eql("world");
      callback(null, true);
    };

    var opts = buildOpts();

    opts.will = {
      topic: "hello",
      payload: "world"
    };

    buildAndConnect(function() {}, opts, function(client) {
      client.stream.end();
    });

    instance.on('published', function(packet) {
      expect(packet.topic).to.be.eql("hello");
      expect(packet.payload.toString().toString()).to.be.eql("world");
      done();
    });
  });

  it("should support will authorization (failure)", function(done) {
    instance.authorizePublish = function(client, topic, payload, callback) {
      expect(topic).to.be.eql("hello");
      expect(payload.toString()).to.be.eql("world");
      callback(null, false);
      done();
    };

    var opts = buildOpts();

    opts.will = {
      topic: "hello",
      payload: "world"
    };

    buildAndConnect(function() {}, opts, function(client) {
      client.stream.end();
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
    var d = donner(2, done);

    instance.authorizeSubscribe = function(client, topic, callback) {
      expect(topic).to.be.eql("hello");
      callback(null, false);
    };

    buildAndConnect(d, function(client) {

      var subscriptions = [{
          topic: "hello",
          qos: 0
        }
      ];

      client.on("suback", function(packet) {
        expect(packet.granted).to.be.eql([0x80]);
        client.disconnect();
        d();
      });

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

  it("should not forward packet if authorizeForward do not call the callback", function(done) {
    var d = donner(2, done);
    var that = this;

    this.instance.authorizeForward = function(client, packet, callback) {
      callback(null, packet.topic !== 'stop_forward');
    };

    buildAndConnect(d, buildOpts(), function(client1) {
      var messageId = Math.floor(65535 * Math.random());

      var subscriptions = [
        { topic : "stop_forward", qos : 1 },
        { topic : "go_forward", qos : 1 }
      ];

      client1.on("publish", function(packet) {
        expect(packet.topic).to.equal("go_forward");
      });
      client1.on("suback", function() {
        buildAndConnect(d, buildOpts(), function(client2) {
          client2.on("puback", function(packet) {
            client1.disconnect();
            client2.disconnect();
          });
          client2.publish({
            topic: "stop_forward",
            messageId: messageId,
            qos: 1
          });

          client2.publish({
            topic: "go_forward",
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

  it("should support retained messages", function(done) {

    steed.waterfall([

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
            expect(packet.payload.toString().toString()).to.be.eql("world world");
            client.stream.end();
          });

          client.stream.on('end', cb);
        });
      }
    ], function() {
      setImmediate(done);
    });
  });

  it("should return only a single retained message", function(done) {

    steed.waterfall([

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

    steed.series([

      function(cb) {
        buildAndConnect(cb, opts, function(client, connack) {

          // sessionPresent must be false
          expect(connack.sessionPresent).to.be.eql(false);

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
        buildAndConnect(cb, opts, function(client, connack) {

          // reconnection sessionPresent must be true
          expect(connack.sessionPresent).to.be.eql(true);

          client.publish({
            topic: "hello",
            qos: 1,
            payload: "world",
            messageId: 42
          });

          client.on("publish", function(packet) {
            expect(packet.topic).to.be.eql("hello");
            expect(packet.payload.toString()).to.be.eql("world");
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

    steed.series([

      function(cb) {
        buildAndConnect(cb, opts, function(client, connack) {

          // sessionPresent must be false
          expect(connack.sessionPresent).to.be.eql(false);

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
        buildAndConnect(cb, buildOpts(), function(client, connack) {

          // buildOpts create new id, so is new session, sessionPresent must be false
          expect(connack.sessionPresent).to.be.eql(false);

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
        buildAndConnect(cb, opts, function(client, connack) {

          // reconnection sessionPresent must be true
          expect(connack.sessionPresent).to.be.eql(true);

          client.on("publish", function(packet) {
            expect(packet.topic).to.be.eql("hello");
            expect(packet.payload.toString()).to.be.eql("world");
            client.disconnect();
          });
        });
      }
    ], done);
  });

  it("cleanSession = false, on reconnect cleanSession = true", function(done) {
    var opts = buildOpts();

    opts.clientId = "mosca-unclean-client-test";

    steed.series([

      function(cb) {
        opts.clean = false;
        buildAndConnect(cb, opts, function(client, connack) {

          // sessionPresent must be false
          expect(connack.sessionPresent).to.be.eql(false);

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
        buildAndConnect(cb, buildOpts(), function(client, connack) {

          // buildOpts create new id, so is new session, sessionPresent must be false
          expect(connack.sessionPresent).to.be.eql(false);

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
        opts.clean = true;
        buildAndConnect(cb, opts, function(client, connack) {

          // reconnection sessionPresent must be false, it is clean
          expect(connack.sessionPresent).to.be.eql(false);

          client.on("publish", function(packet) {
            cb(new Error("unexpected publish"));
          });

          setTimeout(function(){
            client.disconnect();
          }, 1000);
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

    steed.waterfall([
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

    steed.series([

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
            expect(packet.payload.toString()).to.eql("world");
            expect(packet.qos).to.eql(1);
          });
        });
      }
    ], done);
  });

  it("should not deliver all offline messages more than once", function(done) {
    var opts = buildOpts();

    opts.clientId = "mosca-unclean-clients-test3";
    opts.clean = false;
    opts.keepalive = 0;

    steed.series([

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
            expect(packet.payload.toString()).to.eql("world");
            expect(packet.qos).to.eql(1);
          });
        });
      },

      function(cb) {
        setTimeout(cb, 100);
      },

      function(cb) {
        buildAndConnect(cb, opts, function(client) {

          client.on("publish", function(packet) {
            cb(new Error("unexpected publish"));
          });

          setTimeout(function() {
            client.disconnect();
          }, 50);
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
    buildTest("test/topic/", "test/topic", false);
    buildTest("+/+/+/+/+/+/+/+/+/+/test", "one/two/three/four/five/six/seven/eight/nine/ten/test");
    buildTest("/test/topic", "test/topic", false);
    buildTest("/test//topic", "/test/topic", false);
    buildTest("/test//topic", "/test//topic");
    buildTest("/test/+/topic", "/test//topic", false);
    buildTest("/test/#/topic", "/test//topic");
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
        expect(packet.payload.toString()).to.equal("world");
        expect(packet).to.have.property("qos", 1);
        client.disconnect();
      });

      client.subscribe({
        subscriptions: subscriptions,
        messageId: messageId
      });
    });
  });

  it("should have an id", function() {
    expect(instance.id).to.be.truthy;
  });

  it("should have a configurable id", function(done) {
    var newSettings = moscaSettings();
    newSettings.id = "4242";
    secondInstance = new mosca.Server(newSettings, done);
    expect(secondInstance.id).to.eql("4242");
  });
};
