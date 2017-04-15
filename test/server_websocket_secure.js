var steed = require("steed");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");
var request = require('supertest');

var SECURE_KEY = __dirname + '/secure/tls-key.pem';
var SECURE_CERT = __dirname + '/secure/tls-cert.pem';

var moscaSettings = function() {
  var settings = {
    stats: false,
    logger: {
      level: "error"
    },
    persistence: {
      factory: mosca.persistence.Memory
    },
    https: {
      port: nextPort(),
      static: __dirname + "/static",
      bundle: true
    },
    secure: {
      keyPath: SECURE_KEY,
      certPath: SECURE_CERT
    },
    onlyHttp: true
  };

  // this is required to make the original server
  // test work
  // TODO refactor abstract test suite to take
  // the port as a parameter
  settings.port = settings.https.port;

  return settings;
};

describe("mosca.Server - Secure Websocket", function() {
  abstractServerTests(moscaSettings, require('./helpers/createSecureWebsocketConnection'));

  before(function(done) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Ignore self-signed certificate errors
    done();
  });

  after(function(done) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    done();
  });

  it("should retrieve a static file", function(done) {
    var curPort = nextPort() - 1;
    var req = request("https://localhost:" + curPort);

    req.get('/test').expect(200, "42").end(done);
  });

  it("should serve a browserify bundle", function(done) {
    var curPort = nextPort() - 1;
    var req = request("https://localhost:" + curPort);

    req.get('/mqtt.js')
       .expect('Content-Type', /javascript/)
       .expect(200).end(done);
  });
});
