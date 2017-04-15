var steed = require("steed");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");
var createConnection = require("./helpers/createWebsocketConnection");
var request = require('supertest');

var moscaSettings = function() {
  var settings = {
    stats: false,
    logger: {
      level: "error"
    },
    persistence: {
      factory: mosca.persistence.Memory
    },
    http: {
      port: nextPort(),
      static: __dirname + "/static",
      bundle: true
    },
    onlyHttp: true
  };

  // this is required to make the original server
  // test work
  // TODO refactor abstract test suite to take
  // the port as a parameter
  settings.port = settings.http.port;

  return settings;
};

describe("mosca.Server - Websocket", function() {
  abstractServerTests(moscaSettings, createConnection);

  it("should retrieve a static file", function(done) {
    var curPort = nextPort() - 1;
    var req = request("http://localhost:" + curPort);

    req.get('/test').expect(200, "42").end(done);
  });

  it("should serve the 'index.html' file in the static folder as '/'", function(done) {
    var curPort = nextPort() - 1;
    var req = request("http://localhost:" + curPort);

    req.get('/').expect(200, "Hello World\n").end(done);
  });

  it("should serve a browserify bundle", function(done) {
    var curPort = nextPort() - 1;
    var req = request("http://localhost:" + curPort);

    req.get("/mqtt.js")
       .expect("Content-Type", /javascript/)
       .expect(200).end(done);
  });

  it("should return a 404 on a missing file", function(done) {
    var curPort = nextPort() - 1;
    var req = request("http://localhost:" + curPort);

    req.get("/missing").expect(404, "Not Found\n").end(done);
  });
});
