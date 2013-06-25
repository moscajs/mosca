"use strict";

var async = require("async");

function AbstractPersistence() {

}

AbstractPersistence.prototype.wire = function(server) {
  var that = this;
  var nop = function() {};
  server.persistance = this;

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
      
      client.forward(packet.topic, packet.payload, packet, packet.topic);
    });
  });

  server.on("clientDisconnecting", function(client) {
    that.storeSubscriptions(client);
    that.storeInflightPackets(client);
  });
};

AbstractPersistence.prototype.storeInflightPackets = function(client, done) {
  if (client.inflight) {
    var that = this;
    async.each(Object.keys(client.inflight), function(key, cb) {
      that._storePacket(client.id, client.inflight[key].packet, cb);
    }, done);
  }
};

module.exports = AbstractPersistence;
