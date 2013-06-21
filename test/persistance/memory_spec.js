"use strict";

var abstract = require("./abstract");
var Memory = require("../../").persistance.Memory;

describe("mosca.persistance.Memory", function() {

  var opts = { 
    ttl: {
      checkFrequency: 250,
      subscriptions: 250,
      packets: 250
    }
  };

  abstract(function(cb) {
    cb(null, new Memory(opts), opts);
  });
});
