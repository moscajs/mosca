var mqtt = require("mqtt");
var steed = require("steed");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");
var redis = require("ioredis");
var createConnection = require("./helpers/createConnection");

describe("mosca.Server with redis persistence", function() {

  beforeEach(function(cb) {
    var client = redis.createClient();
    client.on("ready", function() {
      client.flushdb(function() {
        client.quit(cb);
      });
    });
  });

  function moscaSettings() {
    return {
      port: nextPort(),
      stats: false,
      publishNewClient: false,
      logger: {
        level: "error"
      },
      backend : {
        type: "redis"
        // not reusing the connection
        // because ascoltatori has not an autoClose option
        // TODO it must be handled in mosca.Server
      },
      persistence : {
        factory: mosca.persistence.Redis
      }
    };
  }

  abstractServerTests(moscaSettings, createConnection);
});
