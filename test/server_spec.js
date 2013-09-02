var mqtt = require("mqtt")
  , abstractServerTests = require("./abstract_server");

var moscaSettings = function() {
  return {
    port: nextPort(),
    logger: {
      childOf: globalLogger,
      level: 60
    }
  };
};

describe("mosca.Server", function() {
  abstractServerTests(moscaSettings, mqtt.createConnection)
});
