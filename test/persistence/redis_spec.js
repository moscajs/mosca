"use strict";

var abstract = require("./abstract");
var Redis = require("../../").persistence.Redis;
var redis = require("redis");

describe("mosca.persistence.Redis", function() {

  this.timeout(2000);

  var opts = {
    ttl: {
      checkFrequency: 1000,
      subscriptions: 1000,
      packets: 1000
    }
  };

  abstract(Redis, opts);

  afterEach(function afterEachRedis(cb) {
    function flush() {
      var client = redis.createClient();
      client.flushdb(function() {
        client.quit(cb);
      });
    }

    if (this.secondInstance) {
      this.secondInstance.close(flush);
      this.secondInstance = null;
    } else {
      flush();
    }
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
        payload: new Buffer("world"),
        messageId: 42
      };

      var that = this;

      this.instance.storeSubscriptions(client, function() {
        that.instance.close(function() {
          that.instance = new Redis(opts, function(err, second) {
            second.storeOfflinePacket(packet, function() {
              second.streamOfflinePackets(client, function(err, p) {
                expect(p).to.eql(packet);
                done();
              });
            });
          });
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
      that.secondInstance = new Redis(opts, function() {
        that.instance.storeSubscriptions(client, function() {
          setTimeout(function() {
            that.secondInstance.storeOfflinePacket(packet, function() {
              that.instance.streamOfflinePackets(client, function(err, p) {
                expect(p).to.eql(packet);
                done();
              });
            });
          }, 20);
        });
      });
    });
  });
});

describe("mosca.persistence.Redis select database", function() {
  this.timeout(2000);

  var opts = {
    ttl: {
      checkFrequency: 1000,
      subscriptions: 1000,
      packets: 1000
    },
    db: 1 // different from default redis database
  };

  abstract(Redis, opts);

  function flush(cb) {
    var client = redis.createClient();
    client.select(opts.db);
    client.flushdb(function() {
      client.quit(cb);
    });
  }

  beforeEach(function afterEachRedis(cb) {
    flush(cb);
  });

  afterEach(function afterEachRedis(cb) {
    flush(cb);
  });

  it("should have persistent data in selected database", function(done) {
    var client = {
      id: "my client id",
      clean: false,
      subscriptions: {
        "hello/#": {
          qos: 1
        }
      }
    };

    var redisClientSubscriptionKey = 'client:sub:' + client.id;

    this.instance.storeSubscriptions(client, function() {

      var redisClient = redis.createClient();
      redisClient.select(opts.db);
      redisClient.exists(redisClientSubscriptionKey, function(err, existence) {
        expect(!!existence).to.eql(true);
        redisClient.quit(done);
      });
    });
  });
});
