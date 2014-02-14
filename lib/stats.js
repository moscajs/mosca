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

  events.forEach(function(event) {
    server.on(event.name, event);
  });

  server.once("closed", function() {
    events.forEach(function(event) {
      server.removeListener(event.name, event);
    });
  });
};

module.exports = Stats;
