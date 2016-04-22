"use strict";

var abstract = require("./abstract");
var Redis = require("../../").persistence.Redis;
var redis = require("ioredis");

describe("mosca.persistence.Redis", function() {

  this.timeout(5000);

  var opts = {
    ttl: {
      subscriptions: 1000,
      packets: 200
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
        messageId: "42"
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

    it("should support subscriptions for clients with id containing ':'", function(done) {
      var client = {
        id: "0e:40:08:ab:1d:a2",
        clean: false,
        subscriptions: {
          "hello/#": {
            qos: 1
          }
        }
      };

      var that = this;

      this.instance.storeSubscriptions(client, function() {
        that.instance.close(function() {
          that.instance = new Redis(opts, function(err, second) {
            second.lookupSubscriptions(client, function(err, subs) {
              expect(subs).to.eql(client.subscriptions);
              done();
            });
          });
        });
      });
    });

    it("should support restoring for clients with id containing ':'", function(done) {
      var client = {
        id: "0e:40:08:ab:1d:a3",
        clean: false,
        subscriptions: {
          "hello/#": {
            qos: 1
          }
        }
      };

      var packet = {
        topic: "hello/43",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "43"
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
        messageId: "42"
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

  describe("ttl.packets", function() {

    var redisClient;

    beforeEach(function() {
      redisClient = redis.createClient();
    });

    afterEach(function(done) {
      redisClient.quit(done);
    });

    var client = {
      id: "my client id - 46",
      clean: false,
      subscriptions: {
        "hello/#": {
          qos: 1
        }
      }
    };

    it("expired packet id should be removed", function(done) {
      var that = this;

      var packet = {
        topic: "hello/46",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "46"
      };

      that.instance.storeSubscriptions(client, function() {
        that.instance.storeOfflinePacket(packet, function() {
          setTimeout(function() {
            redisClient.get("packets:" + client.id + ":" + packet.messageId, function(err, result) {
              expect(result).to.eql(null);
              done();
            });
          }, 250);
        });
      });
    });

    it("expired packet id should be cleaned from list key", function(done) {

      var that = this;

      var firstPacket = {
        topic: "hello/46",
        qos: 0,
        payload: new Buffer("world"),
        messageId: "46"
      },
      secondPacket = {
        topic: "hello/47",
        qos: 0,
        payload: new Buffer("mosca"),
        messageId: "47"
      };

      function delayStoreOfflinePacket(packet, delay, cb) {
        setTimeout(function() {
          that.instance.storeOfflinePacket(packet, cb);
        }, delay);
      }

      that.instance.storeSubscriptions(client, function() {
        delayStoreOfflinePacket(firstPacket, 1, function(err) {
          delayStoreOfflinePacket(secondPacket, 250, function(err){
            that.instance.streamOfflinePackets(client, function(err, p) {
              expect(p).to.eql(secondPacket);
            });

            setTimeout(function() {
              redisClient.llen("packets:" + client.id, function(err, length) {
                expect(length).to.eql(1);
                done();
              });
            }, 50);
          });
        });
      });
    });

  });


  describe("clustered.environment", function(){

    it("should forward each packet once after client reconnects", function(done) {
      var client = {
        id: "cluster client id - 42",
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
        messageId: "42"
      };

      var that = this;
      that.secondInstance = new Redis(opts, function() {
        that.instance.storeSubscriptions(client, function() {
          // simulate client reconnect since storeSubscriptions is called on disconnect
          // no matter client connects to instance or secondInstance
          that.secondInstance.storeSubscriptions(client, function () {
            setTimeout(function () {
              that.secondInstance.storeOfflinePacket(packet, function () {
                that.instance.streamOfflinePackets(client, function (err, p) {
                  expect(p).to.eql(packet);
                  done(); // should be called once
                });
              });
            }, 50);
          });
        });
      });
    });

  });
});


describe("mosca.persistence.Redis select database", function() {
  var opts = {
    ttl: {
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
