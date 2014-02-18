/*
Copyright (c) 2013-2014 Matteo Collina, http://matteocollina.com

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

var moment = require("moment");
var version = "mosca " + require("../package").version;

/**
 * Create a new load object.
 *
 * @api private
 */
function Load() {
  this.publishedMessages = 0;
  this.connectedClients = 0;
}

/**
 * A Stats object is used to keep track of the state of a mosca.Server
 * and can be wired() there.
 *
 * It provides the following stats:
 *  - connectedClients: the number of connected clients at this point in time
 *
 * @api public
 */
function Stats() {
  if (!(this instanceof Stats)) {
    return new Stats();
  }

  this.connectedClients = 0;
  this.publishedMessages = 0;
  this.started = new Date();

  this.current = {
    m15: new Load(),
    m1: new Load()
  };
  this.load = {
    m15: new Load(),
    m1: new Load()
  };
}

/**
 * Inlinable method for adding a connected
 * client.
 *
 * @api private
 */
function clientConnected() {
  /*jshint validthis:true */
  this.stats.connectedClients++;
  this.stats.current.m1.connectedClients++;
  this.stats.current.m15.connectedClients++;
}

/**
 * Inlinable method for removing a connected
 * client.
 *
 * @api private
 */
function clientDisconnected() {
  /*jshint validthis:true */
  this.stats.connectedClients--;
}

/**
 * Inlinable method for counting published
 * messages
 *
 * @api private
 */
function published() {
  /*jshint validthis:true */
  this.stats.publishedMessages++;
  this.stats.current.m1.publishedMessages++;
  this.stats.current.m15.publishedMessages++;
}

/**
 * Events that update the stats
 *
 * @api private
 */
var events = [
  clientConnected,
  clientDisconnected,
  published
];

/**
 * wire() adds the stats to a mosca.Server.
 *
 * @api public
 * @param {Server} server The Mosca Server.
 */
Stats.prototype.wire = function wire(server) {
  server.stats = this;

  var count = 0;

  function doPublish(topic, value) {
    server.publish({
      topic: "$SYS/" + server.id + "/" + topic,
      payload: "" + value
    });
  }

  var mom = moment(this.started);

  var timer = setInterval(function() {
    var stats = server.stats;
    var mem = process.memoryUsage();
    stats.load.m1 = stats.current.m1;
    stats.current.m1 = new Load();

    if (++count % 15 === 0) {
      stats.load.m15 = stats.current.m15;
      stats.current.m15 = new Load();
      count = 0;
    }

    doPublish("version", version);
    doPublish("uptime", mom.from(Date.now(), true));
    doPublish("connectedClients", stats.connectedClients);
    doPublish("publishedMessages", stats.publishedMessages);
    doPublish("load/15m/connectedClients", stats.load.m15.connectedClients);
    doPublish("load/15m/publishedMessages", stats.load.m15.publishedMessages);
    doPublish("load/1m/connectedClients", stats.load.m1.connectedClients);
    doPublish("load/1m/publishedMessages", stats.load.m1.publishedMessages);
    doPublish("memory/rss", mem.rss);
    doPublish("memory/heapUsed", mem.heapUsed);
    doPublish("memory/heapTotal", mem.heapTotal);
  }, 60 * 1000);

  events.forEach(function(event) {
    server.on(event.name, event);
  });

  server.once("closed", function() {
    clearInterval(timer);

    events.forEach(function(event) {
      server.removeListener(event.name, event);
    });
  });
};

module.exports = Stats;
