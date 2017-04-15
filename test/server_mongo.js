var mqtt = require("mqtt");
var steed = require("steed");
var ascoltatori = require("ascoltatori");
var abstractServerTests = require("./abstract_server");
var MongoClient = require("mongodb").MongoClient;
var clean = require("mongo-clean");
var createConnection = require("./helpers/createConnection");

describe("mosca.Server with mongo persistence", function() {
  this.timeout(10000);

  var mongoConnection;
  var mongoUrl = "mongodb://localhost:27017/mosca";

  before(function(done) {
    // Connect to the db
    MongoClient.connect(mongoUrl, { w: 1 }, function(err, db) {
      mongoConnection = db;
      done(err);
    });
  });

  after(function(done) {
    mongoConnection.close(done);
  });

  beforeEach(function(done) {
    clean(mongoConnection, done);
  });

  function moscaSettings() {
    return {
      port: nextPort(),
      stats: false,
      publishNewClient: false,
      publishClientDisconnect: false,
      logger: {
        level: "error"
      },
      backend : {
        type: "mongo"
        // not reusing the connection
        // because ascoltatori has not an autoClose option
        // TODO it must be handled in mosca.Server
      },
      persistence : {
        factory: mosca.persistence.Mongo,
        connection: mongoConnection,
        autoClose: false
      },
    };
  }

  abstractServerTests(moscaSettings, createConnection);
});
