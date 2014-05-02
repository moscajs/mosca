var SECURE_CERT = __dirname + '/../secure/tls-cert.pem';
var fs = require("fs");
var tls = require("tls");
var mqtt = require("mows");

module.exports = function(port, host, callback) {

  // FIXME it should receive the right host from the
  // caller
  host = "wss://localhost";

  var secureOpts = {
    protocol: {
      ca: fs.readFileSync(SECURE_CERT),
      rejectUnauthorized: false
    }
  };

  var conn = mqtt.createConnection(port, host, secureOpts);

  conn.on('error', function(err){
    console.log(err);
  });

  return conn;
};
