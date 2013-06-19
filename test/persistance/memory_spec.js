"use strict";

var abstract = require("./abstract");
var Memory = require("../../").persistance.Memory;

describe("mosca.persistance.Memory", function() {
  abstract(function(opts, cb) {
    cb(null, new Memory(opts));
  });
});
