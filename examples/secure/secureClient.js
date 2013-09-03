
var mqtt = require('mqtt');
var SECURE_CERT = __dirname + '/../../test/secure/tls-cert.pem';

var PORT = 8443;

var options = {
  certPath: SECURE_CERT,
};

var client = mqtt.createSecureClient(PORT, options);

client.subscribe('messages');
client.publish('messages', 'Current time is: ' + new Date());
client.on('message', function(topic, message) {
  console.log(message);
});