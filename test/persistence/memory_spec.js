"use strict";

var abstract = require("./abstract");
var Memory = require("../../").persistence.Memory;

describe("mosca.persistence.Memory", function() {

  var opts = { 
    ttl: {
      checkFrequency: 250,
      subscriptions: 250,
      packets: 250
    }
  };

  abstract(Memory, opts);
});
