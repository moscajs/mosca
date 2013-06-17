"use strict";

var abstract = require("./abstract");
var Memory = require("../../").persistance.Memory;

describe("mosca.persitance.Memory", function() {
  abstract(function(cb) {
    cb(null, new Memory());
  });
});
