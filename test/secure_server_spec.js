var mqtt = require("mqtt");
var tls = require("tls");
var abstractServerTests = require("./abstract_server");
var fs = require("fs");

var SECURE_KEY = __dirname + '/secure/tls-key.pem';
var SECURE_CERT = __dirname + '/secure/tls-cert.pem';

var moscaSettings = function() {
  return {
    port: nextPort(),
    logger: {
      childOf: globalLogger,
      level: 60
    },
    secure : { 
      keyPath: SECURE_KEY,
      certPath: SECURE_CERT
    }
  };
};

var createConnection = function(port, host, callback) {
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

describe("mosca.Server - Secure Connection", function() {
  abstractServerTests(moscaSettings, createConnection);
});
