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

  server.on("published", function(packet) {
    if (packet.retain) {
      that.storeRetained(packet);
    }
    that.storeOfflinePacket(packet);
  });

  server.on("subscribed", function(pattern, client) {
    that.lookupRetained(pattern, function(err, matches) {
      if (err) {
        client.emit("error", err);
        return;
      }
      matches.forEach(function(match) {
        client.forward(match.topic, match.payload, match, pattern);
      });
    });
  });

  server.on("close", function() {
    that.close();
  });

  server.on("clientConnected", function(client) {
    that.lookupSubscriptions(client, function(err, subscriptions) {
      if (err) {
        client.emit("error", err);
        return;
      }
      
      Object.keys(subscriptions).forEach(function(topic) {
        client.logger.info({ topic: topic, qos: subscriptions[topic].qos }, "restoring subscription");
        client.handleAuthorizeSubscribe(
          null, true, {
            topic: topic,
            qos: subscriptions[topic].qos
          }, nop);
      });
    });

    that.streamOfflinePackets(client, function(err, packet) {
      if (err) {
        client.emit("error", err);
        return;
      }
      client.logger.info({ packet: packet }, "Forwarding offline packet");
      client.forward(packet.topic, packet.payload, packet, packet.topic);
    });
  });

  server.on("clientDisconnecting", function(client) {
    client.logger.info("Storing offline subscriptions");
    that.storeSubscriptions(client);
    client.logger.info("Storing inflight packets");
    that.storeInflightPackets(client);
  });
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
