var SECURE_CERT = __dirname + '/../secure/tls-cert.pem';
var fs = require("fs");
var ws = require("websocket-stream");
var Connection = require("mqtt-connection");

module.exports = function(port) {

  var stream = ws("wss://localhost:" + port, [], {
    ca: fs.readFileSync(SECURE_CERT),
    rejectUnauthorized: false
  });

  var conn = new Connection(stream);

  stream.on('connect', function() {
    conn.emit('connected');
  });

  return conn;
};
