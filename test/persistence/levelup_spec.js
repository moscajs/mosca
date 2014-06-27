"use strict";

var abstract = require("./abstract");
var LevelUp = require("../../").persistence.LevelUp;
var async = require("async");
var tmpdir = require("osenv").tmpdir();
var path = require("path");
var rimraf = require("rimraf");

describe("mosca.persistence.LevelUp", function() {

  this.timeout(2000);

  var opts = {
    ttl: {
      checkFrequency: 250,
      subscriptions: 250,
      packets: 250
    }
  };

  abstract(LevelUp, function(cb) {
    var that = this;
    opts.path = path.join(tmpdir, 'level_' + Date.now());
    cb(null, opts);
  });

  afterEach(function deleteLevel(done) {
    rimraf(opts.path, done);
  });

  describe("two instances", function() {
    it("support restoring from disk", function(done) {
      var client = { 
        id: "my client id - 42",
        clean: false,
        logger: globalLogger,
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
          new LevelUp(opts, function(err, newdb) {
            newdb.storeOfflinePacket(packet, function() {
              newdb.streamOfflinePackets(client, function(err, p) {
                expect(p).to.eql(packet);
                done();
              });
            });
          });
        });
      });
    });
  });
});
