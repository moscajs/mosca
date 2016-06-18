/*
Copyright (c) 2013-2016 Matteo Collina, http://matteocollina.com

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/
"use strict";

var steed = require("steed")();
var EventEmitter = require("events").EventEmitter;
var util = require("util");

/**
 * An Abstract Mosca persistance implementation
 *
 * @api public
 */
function AbstractPersistence() {

}

util.inherits(AbstractPersistence, EventEmitter);

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

    // store qos 0 packets only if storeMessagesQos0 is true or retain is true
    if(packet.qos === 0 && packet.retain === false && ! that.options.storeMessagesQos0){
      return cb();
    }

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
    if (packet.qos !== 0 || that.options.storeMessagesQos0) {
      total++;
      that.storeOfflinePacket(packet, done);
    }
    done();
  };

  server.deleteOfflinePacket = function(client, messageId, cb) {
    that.deleteOfflinePacket(client, messageId, cb);
  };

  server.updateOfflinePacket = function(client, messageId, packet, cb) {
    that.updateOfflinePacket(client, messageId, packet, cb);
  };

  server.forwardRetained = function(pattern, client, done) {
    that.lookupRetained(pattern, function(err, matches) {
      if (err) {
        client.connection.emit("error", err);
        return;
      }
      steed.each(matches, function(match, cb) {
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
        client.connection.emit("error", err);
        return;
      }

      var subs = Object.keys(subscriptions);

      steed.each(subs, function(topic, inCb) {
        client.logger.debug({ topic: topic, qos: subscriptions[topic].qos }, "restoring subscription");
        client.handleAuthorizeSubscribe(
          null, true, {
          topic: topic,
          qos: subscriptions[topic].qos
        }, inCb);
      }, function(){done(subs.length === 0 ? false : true);});
    });
  };

  server.forwardOfflinePackets = function(client, done) {
    // do not waste cpu time find in stored packets...
    // if client is clean lookupSubscriptions already delete stored packets
    if(client.clean)
      return done && done();

    that.streamOfflinePackets(client, function(err, packet) {
      packet.offline = true;
      client.logger.debug({ packet: packet }, "Forwarding offline packet");
      client.forward(packet.topic, packet.payload, packet, packet.topic, packet.qos);
    }, done);
  };

  server.persistClient = function(client, done) {
    client.logger.debug("Storing offline subscriptions");
    that.storeSubscriptions(client, done);
  };
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
