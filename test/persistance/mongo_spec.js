"use strict";

var abstract = require("./abstract");
var Mongo = require("../../").persistance.Mongo;
var redis = require("redis");
var MongoClient = require('mongodb').MongoClient;
var async = require("async");

describe("mosca.persistance.Mongo", function() {

  var opts = { 
    url: "mongodb://localhost:27017/moscatests",
    autoClose: false,
    ttl: {
      checkFrequency: 1000,
      subscriptions: 1000,
      packets: 1000
    }
  };

  before(function(done) {
    // Connect to the db
    MongoClient.connect(opts.url, { safe: true }, function(err, db) {
      opts.connection = db;
      done(err);
    });
  });

  beforeEach(function(done) {
    async.parallel([
      function(cb) {
        opts.connection.collection("subscriptions").drop(cb);
      },
      function(cb) {
        opts.connection.collection("packets").drop(cb);
      },
      function(cb) {
        opts.connection.collection("retained").drop(cb);
      }
    ], done);
  });

  afterEach(function() {
    this.secondInstance = null;
  });

  abstract(function(cb) {
    new Mongo(opts, function(err, mongo) {
      cb(err, mongo, opts);
    });
  });

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
        payload: "world",
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
        payload: "world",
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
