"use strict";

var async = require("async");

module.exports = function(create) {

  var instance = null;

  beforeEach(function(done) {
    create(function(err, result) {
      if (err) {
        return done(err);
      }

      instance = result;
      done();
    });
  });

  afterEach(function(done) {
    instance.close(done);
  });

  it("should store retain messages", function(done) {
    var packet = {
      topic: "hello",
      qos: 0,
      payload: "world",
      messageId: 42,
      retain: true
    };
    instance.storeRetained(packet, done);
  });

  it("should lookup retain messages and not matching", function(done) {
    instance.lookupRetained("hello", function(err, results) {
      expect(results).to.eql([]);
      done();
    });
  });

  it("should match and load a retain message", function(done) {
    var packet = {
      topic: "hello",
      qos: 0,
      payload: "world",
      messageId: 42,
      retain: true
    };

    async.series([
      function(cb) {
        instance.storeRetained(packet, cb);
      },
      function(cb) {
        instance.lookupRetained("hello", function(err, results) {
          expect(results[0]).to.eql(packet);
          cb();
        });
      }
    ], done);
  });

  it("should match and load with a pattern", function(done) {
    var packet1 = {
      topic: "hello/1",
      qos: 0,
      payload: "world",
      messageId: 42,
      retain: true
    };

    var packet2 = {
      topic: "hello/2",
      qos: 0,
      payload: "world",
      messageId: 43,
      retain: true
    };

    async.series([
      function(cb) {
        instance.storeRetained(packet1, cb);
      },
      function(cb) {
        instance.storeRetained(packet2, cb);
      },
      function(cb) {
        instance.lookupRetained("hello/#", function(err, results) {
          expect(results).to.eql([packet1, packet2]);
          cb();
        });
      }
    ], done);
  });
};
