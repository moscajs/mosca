"use strict";

var abstract = require("./abstract");
var LevelUp = require("../../").persistance.LevelUp;
var tmp = require("tmp");
var async = require("async");

describe("mosca.persistance.LevelUp", function() {

  var opts = { 
    ttl: {
      checkFrequency: 250,
      subscriptions: 250,
      packets: 250
    }
  };

  abstract(function(cb) {
    var that = this;
    tmp.dir(function (err, path) {
      if (err) {
        return cb(err);
      }

      that.path = path;
      cb(null, new LevelUp(path, opts), opts);
    });
  });

  describe("two instances", function() {
    it("support restoring from disk", function(done) {
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
          that.instance = new LevelUp(that.path, opts);
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
  });
});
