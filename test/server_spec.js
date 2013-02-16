
var mqtt = require("mqtt");
var microtime = require("microtime");

describe(mosca, function() {

  var instance;
  var settings;

  beforeEach(function(done) {
    settings = mqttSettings();
    instance = new mosca.Server(settings, done);
  });

  afterEach(function(done) {
    instance.close(done);
  });

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

  it("should close the connection after the keepAlive interval", function(done) {
    buildClient(done, function(client) {
      var keepalive = 1;
      var timer = microtime.now();

      client.connect({ keepalive: keepalive });

      client.on("close", function() {
        var interval = (microtime.now() - timer) / 1000000;
        expect(interval).to.be.least(keepalive);
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
});
