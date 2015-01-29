
var Connection = require("mqtt-connection");
var ws = require("websocket-stream");

function createConnection(port) {
  var stream = ws("ws://localhost:" + port);
  var conn = new Connection(stream);
  stream.on('connect', function() {
    conn.emit('connected');
  });
  return conn;
}

module.exports = createConnection;
