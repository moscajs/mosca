
var mqtt = require("mqtt");

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

});
