"use strict";

var abstract = require("./abstract");
var Mongo = require("../../").persistence.Mongo;
var MongoClient = require('mongodb').MongoClient;
var clean = require("mongo-clean");
var steed = require("steed");

describe("mosca.persistence.Mongo", function() {

  this.timeout(4000);

  var opts = {
    url: "mongodb://localhost:27017/moscatests",
    autoClose: false,
    ttl: {
      subscriptions: 1000,
      packets: 1000
    }
  };

  before(function connect(done) {
    // Connect to the db
    MongoClient.connect(opts.url, { safe: true }, function(err, db) {
      opts.connection = db;
      done(err);
    });
  });

  beforeEach(function cleanDB(done) {
    clean(opts.connection, done);
  });

  afterEach(function() {
    this.secondInstance = null;
  });

  abstract(Mongo, opts);

  describe("two clients", function() {

    it("should support restoring", function(done) {
      var client = { 
        id: "my client id - 42",
        clean: false,
        subscriptions: {
          "hello/#": {
            qos: 1
          }
        }
      };

      var packet = {
        topic: "hello/42",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42
      };

      var that = this;

      this.instance.storeSubscriptions(client, function() {
        that.instance.close(function() {
          that.instance = new Mongo(opts);
          setTimeout(function() {
            that.instance.storeOfflinePacket(packet, function() {
              that.instance.streamOfflinePackets(client, function(err, p) {
                expect(p).to.eql(packet);
                done();
              });
            });
          }, 10);
        });
      });
    });

    it("should support synchronization", function(done) {
      var client = { 
        id: "my client id - 42",
        clean: false,
        subscriptions: {
          "hello/#": {
            qos: 1
          }
        }
      };

      var packet = {
        topic: "hello/42",
        qos: 0,
        payload: new Buffer("world"),
        messageId: 42
      };

      var that = this;
      that.secondInstance = new Mongo(opts);

      setTimeout(function() {
        that.instance.storeSubscriptions(client, function() {
          setTimeout(function() {
            that.secondInstance.storeOfflinePacket(packet, function() {
              that.instance.streamOfflinePackets(client, function(err, p) {
                expect(p).to.eql(packet);
                done();
              });
            });
          }, 10);
        });
      }, 10);
    });
  });
});
