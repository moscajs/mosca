var mosca = require('../../')

var SECURE_KEY = __dirname + '/../../test/secure/tls-key.pem';
var SECURE_CERT = __dirname + '/../../test/secure/tls-cert.pem';

var settings = {
  port: 8443,
  logger: {
    name: "secureExample",
    level: 40,
  },
  secure : { 
    keyPath: SECURE_KEY,
    certPath: SECURE_CERT,
  }
};
var server = new mosca.Server(settings);
server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
  console.log('Mosca secure server is up and running')
}