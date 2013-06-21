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
    var client = redis.createClient();
    client.flushdb(cb);
    client.quit();
  });
});
