
var SECURE_KEY = __dirname + '/../../test/secure/tls-key.pem';
var SECURE_CERT = __dirname + '/../../test/secure/tls-cert.pem';

module.exports = {
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