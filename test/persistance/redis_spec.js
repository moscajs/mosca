"use strict";

var abstract = require("./abstract");
var Redis= require("../../").persistance.Redis;
var redis = require("redis");

describe("mosca.persistance.Redis", function() {

  var opts = { 
    ttl: {
      checkFrequency: 1000,
      subscriptions: 1000,
      packets: 1000
    }
  };

  abstract(function(cb) {
    cb(null, new Redis(opts), opts);
  });

  afterEach(function(cb) {
    if (this.secondInstance) {
      this.secondInstance.close();
    }

    var client = redis.createClient();
    client.flushdb(cb);
    client.quit();
  });

  describe("two clients", function() {

    it("should support restoring", function(done) {
      var client = { 
        id: "my client id - 42",
        clean: false,
        subscriptions: {
          "hello/#": 1
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
          that.instance = new Redis(opts);
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
          "hello/#": 1
        }
      };

      var packet = {
        topic: "hello/42",
        qos: 0,
        payload: "world",
        messageId: 42
      };

      var that = this;
      that.secondInstance = new Redis(opts);

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
