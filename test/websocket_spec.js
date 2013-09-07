var mqtt = require("mqtt.js-over-websockets");
var async = require("async");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");

var moscaSettings = function() {
  var settings = {
    logger: {
      childOf: globalLogger,
      level: 60
    },
    http: {
      port: nextPort()
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

describe("mosca.Server", function() {
  abstractServerTests(moscaSettings, mqtt.createConnection);
});
