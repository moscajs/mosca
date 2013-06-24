"use strict";

var abstract = require("./abstract");
var Mongo = require("../../").persistance.Mongo;
var redis = require("redis");
var MongoClient = require('mongodb').MongoClient;

describe("mosca.persistance.Mongo", function() {

  var opts = { 
    url: "mongodb://localhost:27017/moscatests",
    ttl: {
      checkFrequency: 1000,
      subscriptions: 1000,
      packets: 1000
    }
  };

  abstract(function(cb) {
    new Mongo(opts, function(err, mongo) {
      cb(err, mongo, opts);
    });
  });

  afterEach(function(cb) {
    if (this.secondInstance) {
      this.secondInstance.close();
    }

    // Connect to the db
    MongoClient.connect(opts.url, function(err, db) {
      if (err) {
        return cb(err);
      }

      db.dropDatabase(cb);
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
