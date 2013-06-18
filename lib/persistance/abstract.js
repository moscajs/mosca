
function AbstractPersistence() {

}

AbstractPersistence.prototype.wire = function(server) {
  var that = this;

  server.on("published", function(packet) {
    if (packet.retain) {
      that.storeRetained(packet);
    }
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
            qos: subscriptions[topic]
          }, function() {});
      });
    });
  });

  server.on("clientDisconnecting", function(client) {
    that.storeSubscriptions(client);
  });
};

module.exports = AbstractPersistence;
