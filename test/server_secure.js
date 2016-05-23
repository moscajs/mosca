var abstractServerTests = require("./abstract_server");
var createConnection = require("./helpers/createConnection");

var SECURE_KEY = __dirname + "/secure/tls-key.pem";
var SECURE_CERT = __dirname + "/secure/tls-cert.pem";

var moscaSettings = function() {
  var port = nextPort();
  var settings = {
    stats: false,
    logger: {
      level: "error"
    },
    persistence: {
      factory: mosca.persistence.Memory
    },
    secure: {
      port: port,
      keyPath: SECURE_KEY,
      certPath: SECURE_CERT
    }
  };

  // this is required to make the original server
  // test work
  // TODO refactor abstract test suite to take
  // the port as a parameter
  settings.port = port;

  return settings;
};

describe("mosca.Server - Secure Connection", function() {
  abstractServerTests(moscaSettings, require("./helpers/createSecureConnection"));
});

describe("mosca.Server - Secure and non-secure Connection", function() {
  var settings;
  var instance;
  var conn;

  afterEach(function(done) {
    if (conn) {
      conn.stream.end();
      conn.on("close", function() {
        instance.close(done);
      });
    } else {
      instance.close(done);
    }
  });

  it("should not allow non-secure connections", function(done) {
    settings = moscaSettings();
    settings.secure.port = nextPort();

    instance = new mosca.Server(settings, function() {
      conn = createConnection(settings.port);
      conn.once("error", function(err) {
        conn = null;
        done();
      });
    });
  });

  it("should allow non-secure connections", function(done) {
    settings = moscaSettings();
    settings.allowNonSecure = true;
    settings.secure.port = nextPort();

    instance = new mosca.Server(settings, function() {
      conn = createConnection(settings.port);
      conn.on("connected", function(err) {
       
        done();
      });
    });
  });
});
