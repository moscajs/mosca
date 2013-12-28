"use strict";

var async = require("async");

/**
 * An Abstract Mosca persistance implementation
 *
 * @api public
 */
function AbstractPersistence() {

}

/**
 * This wires the Mosca server to a persistance, plugging in
 * the persistance into the relevant Mosca events.
 *
 * @api public
 * @param {Server} server The Mosca Server.
 */
AbstractPersistence.prototype.wire = function(server) {
  var that = this;
  var nop = function() {};
  server.persistence = this;

  server.storePacket = function(packet, cb) {
    var total = 1;
    var done = function() {
      if (--total === 0 && cb) {
        cb();
      }
    };
    if (packet.retain) {
      total++;
      that.storeRetained(packet, done);
    }
    that.storeOfflinePacket(packet, done);
  };

  server.forwardRetained = function(pattern, client, done) {
    that.lookupRetained(pattern, function(err, matches) {
      if (err) {
        client.emit("error", err);
        return;
      }
      async.each(matches, function(match, cb) {
        client.forward(match.topic, match.payload, match, pattern, match.qos, cb);
      }, done);
    });
  };

  server.on("close", function() {
    that.close();
  });

  server.restoreClientSubscriptions = function restoreClientSubscriptions(client, done) {
    that.lookupSubscriptions(client, function(err, subscriptions) {
      if (err) {
        client.emit("error", err);
        return;
      }

      async.each(Object.keys(subscriptions), function(topic, inCb) {
        client.logger.debug({ topic: topic, qos: subscriptions[topic].qos }, "restoring subscription");
        client.handleAuthorizeSubscribe(
          null, true, {
          topic: topic,
          qos: subscriptions[topic].qos
        }, inCb);
      }, done);
    });
  };

  server.forwardOfflinePackets = function forwardOfflinePackets(client, done) {
    that.streamOfflinePackets(client, function(err, packet) {
      if (err) {
        client.emit("error", err);
        return;
      }
      client.logger.debug({ packet: packet }, "Forwarding offline packet");
      client.forward(packet.topic, packet.payload, packet, packet.topic);
    }, done);
  };

  server.persistClient = function(client, done) {
    async.parallel([
      function(cb) {
        client.logger.debug("Storing offline subscriptions");
        that.storeSubscriptions(client, cb);
      },
      function(cb) {
        client.logger.debug("Storing inflight packets");
        that.storeInflightPackets(client, cb);
      }
    ], done);
  };
};

/**
 * Store the current in-flight packets for the given client in the Offline Packets
 * store.
 *
 * @api private
 * @param {Client} client the Mosca client
 * @param {Function} done the callback that will be called after everything is done
 */
AbstractPersistence.prototype.storeInflightPackets = function(client, done) {
  if (client.inflight) {
    var that = this;
    async.each(Object.keys(client.inflight), function(key, cb) {
      that._storePacket(client.id, client.inflight[key].packet, cb);
    }, done);
  } else if (done) {
    done();
  }
};

/**
 * Close the persistance.
 *
 * @api public
 * @param {Function} done the callback
 */
AbstractPersistence.prototype.close = function(done) {
  if (done) {
    done(new Error("not implemented yet"));
  }
};

/**
 * Export it as a module
 *
 * @api public
 */
module.exports = AbstractPersistence;
