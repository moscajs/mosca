var Connection = require("mqtt-connection");
var net = require("net");

function createConnection(port) {
  var stream = net.createConnection(port);
  var conn = new Connection(stream);
  stream.on('connect', function() {
    conn.emit('connected');
  });
  return conn;
}

module.exports = createConnection;
