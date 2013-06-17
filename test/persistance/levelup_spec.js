"use strict";

var abstract = require("./abstract");
var LevelUp = require("../../").persistance.LevelUp;
var tmp = require("tmp");

describe("mosca.persistance.LevelUp", function() {
  abstract(function(cb) {
    tmp.dir(function (err, path) {
      if (err) {
        return cb(err);
      }

      cb(null, new LevelUp(path));
    });
  });
});
