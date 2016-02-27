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

var moment = require("moment");
var movingAverage = require("moving-average");
var version = "mosca " + require("../package").version;

/**
 * Create a new load object.
 *
 * @api private
 */
function Load(minutes) {
  this.maPublishedMessages = movingAverage(minutes * 60 * 1000);
  this.maPublishedMessages.push(Date.now(), 0);
  this.maConnectedClients = movingAverage(minutes * 60 * 1000);
  this.maConnectedClients.push(Date.now(), 0);
}

Object.defineProperties(Load.prototype, {
  "publishedMessages": {
    get: function () {
      var value = this.maPublishedMessages.movingAverage();
      value = Math.round(value * 100) / 100;
      return value;
    }
  },
  "connectedClients": {
    get: function () {
      var value = this.maConnectedClients.movingAverage();
      value = Math.round(value * 100) / 100;
      return value;
    }
  }
});

/**
 * A Stats object is used to keep track of the state of a mosca.Server
 * and can be wired() there.
 *
 * It provides the following stats:
 *  - connectedClients: the number of connected clients at this point in time
 *  - publishedMessages: the number of publish messages received since the the start
 *
 * It also track the load at 1min, 5min, and 15min of the same events.
 *
 * @api public
 */
function Stats() {
  if (!(this instanceof Stats)) {
    return new Stats();
  }

  this.maxConnectedClients = 0;
  this.connectedClients = 0;
  this.lastIntervalConnectedClients = 0;
  this.publishedMessages = 0;
  this.lastIntervalPublishedMessages = 0;
  this.started = new Date();

  this.load = {
    m15: new Load(15),
    m5: new Load(5),
    m1: new Load(1)
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
  this.stats.lastIntervalConnectedClients++;
  if( this.stats.connectedClients > this.stats.maxConnectedClients ) {
    this.stats.maxConnectedClients = this.stats.connectedClients;
  }
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
  this.stats.lastIntervalConnectedClients--;
}

/**
 * Inlinable method for counting published
 * messages
 *
 * @api private
 */
function published( packet ) {
  /*jshint validthis:true */
  if( packet && packet.topic && packet.topic.indexOf( '$SYS' ) < 0 ) { // count only publishes in user namespace
    this.stats.publishedMessages++;
    this.stats.lastIntervalPublishedMessages++;
  }
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

    var date = new Date();

    stats.load.m1.maConnectedClients.push(date, stats.lastIntervalConnectedClients);
    stats.load.m5.maConnectedClients.push(date, stats.lastIntervalConnectedClients);
    stats.load.m15.maConnectedClients.push(date, stats.lastIntervalConnectedClients);
    stats.lastIntervalConnectedClients = 0;

    stats.load.m1.maPublishedMessages.push(date, stats.lastIntervalPublishedMessages);
    stats.load.m5.maPublishedMessages.push(date, stats.lastIntervalPublishedMessages);
    stats.load.m15.maPublishedMessages.push(date, stats.lastIntervalPublishedMessages);
    stats.lastIntervalPublishedMessages = 0;

    doPublish("version", version);
    doPublish("started_at", server.stats.started.toISOString());
    doPublish("uptime", mom.from(Date.now(), true));
    doPublish("clients/maximum", stats.maxConnectedClients);
    doPublish("clients/connected", stats.connectedClients);
    doPublish("publish/received", stats.publishedMessages);
    doPublish("load/connections/15min", stats.load.m15.connectedClients);
    doPublish("load/publish/received/15min", stats.load.m15.publishedMessages);
    doPublish("load/connections/5min", stats.load.m5.connectedClients);
    doPublish("load/publish/received/5min", stats.load.m5.publishedMessages);
    doPublish("load/connections/1min", stats.load.m1.connectedClients);
    doPublish("load/publish/received/1min", stats.load.m1.publishedMessages);
    doPublish("memory/rss", mem.rss);
    doPublish("memory/heap/current", mem.heapUsed);
    doPublish("memory/heap/maximum", mem.heapTotal);
  }, 10 * 1000);

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
