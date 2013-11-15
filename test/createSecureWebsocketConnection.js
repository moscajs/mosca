var SECURE_CERT = __dirname + '/secure/tls-cert.pem';
var fs = require("fs");
var tls = require("tls");
var mqtt = require("mows");

module.exports = function(port, host, callback) {

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
