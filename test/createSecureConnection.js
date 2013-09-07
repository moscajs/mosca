var SECURE_CERT = __dirname + '/secure/tls-cert.pem';
var fs = require("fs");
var tls = require("tls");
var mqtt = require("mqtt");

module.exports = function(port, host, callback) {
  var net_client, mqtt_conn, tls_opts = {};
  if ('undefined' === typeof port) {
    // createConnection();
    port = defaultPort;
    host = defaultHost;
    callback = function(){};
  } else if ('function' === typeof port) {
    // createConnection(function(){});
    callback = port;
    port = defaultPort;
    host = defaultHost;
  } else if ('function' === typeof host) {
    // createConnection(1883, function(){});
    callback = host;
    host = defaultHost;
  } else if ('function' !== typeof callback) {
    // createConnection(1883, 'localhost');
    callback = function(){};
  }

  tls_opts.rejectUnauthorized = false;
  tls_opts.cert = fs.readFileSync(SECURE_CERT);

  net_client = tls.connect(port, host, tls_opts, function() {
    if (process.env.NODE_DEBUG) {
      if (tls_client.authorized) {
        console.log("Connection authorized by a Certificate Authority.");
      } else {
        console.log("Connection not authorized: " + tls_client.authorizationError);
      } 
    }
  });

  mqtt_conn = net_client.pipe(new mqtt.MqttConnection());

  // Echo net errors
  net_client.on('error', mqtt_conn.emit.bind(mqtt_conn, 'error'));

  net_client.on('close', mqtt_conn.emit.bind(mqtt_conn, 'close'));

  net_client.on('secureConnect', function() {
    mqtt_conn.emit('connected');
  });

  mqtt_conn.once('connected', function() {
    callback(null, mqtt_conn);
  });

  mqtt_conn.once('error', function(err) {
    callback(err);
  });

  return mqtt_conn;
};
