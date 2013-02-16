
var mqtt = require("mqtt");
var async = require("async");
var ascoltatori = require("ascoltatori");

function Server(opts, callback) {
  this.opts = opts;
  opts.port = opts.port || 1883;

  this.ascoltatore = new ascoltatori.MemoryAscoltatore()

  this.clients = {};

  var that = this;
  this.server = mqtt.createServer(function(client) {
    that.serve(client);
  });
  this.server.listen(opts.port, callback);
}

Server.prototype.close = function(callback) {
  var that = this;

  async.parallel(Object.keys(that.clients).map(function(id) { 
    return function(cb) {
      that.closeConn(that.clients[id], cb);
    }
  }), function() {
    try {
      that.server.close(callback);
    } catch(exception) {
      callback();
    }
  });
};

Server.prototype.serve = function (client) {

  var that = this;

  var setUpTimer = function() {
    if(client.timer)
      clearTimeout(client.timer);

    client.timer = setTimeout(function() {
      that.closeConn(client);
    }, client.keepalive * 1000 * 5/4);
  };

  var forward = function(topic, payload) {
    client.publish({ topic: topic, payload: payload });
  };

  client.on("connect", function(packet) {
    client.id = packet.client;
    client.keepalive = packet.keepalive;

    that.clients[client.id] = client;

    setUpTimer();
    client.connack({ returnCode: 0 });
  });

  client.on("pingreq", function() {
    setUpTimer();
    client.pingresp();
  });

  client.on("subscribe", function(packet) {
    var granted = packet.subscriptions.map(function(e) {
      return 0;
    });

    async.parallel(packet.subscriptions.map(function(s) {
      return function(cb) {
        that.ascoltatore.subscribe(s.topic, forward, cb);
      }
    }), function() {
      client.suback({ messageId: packet.messageId, granted: granted });
    });
  });

  client.on("publish", function(packet) {
    that.ascoltatore.publish(packet.topic, packet.payload);
  });

  client.on("unsubscribe", function(packet) {
    async.parallel(packet.unsubscriptions.map(function(topic) {
      return function(cb) {
        that.ascoltatore.unsubscribe(s, forward, cb);
      }
    }), function() {
      client.unsuback({ messageId: packet.messageId });
    });
  });
  
  client.on("disconnect", function() {
    that.closeConn(client);
  });

  client.on("error", function() {
    that.closeConn(client);
  });
};

Server.prototype.closeConn = function(client, callback) {
  if(client.id) {
    clearTimeout(client.timer);
    delete this.clients[client.id];
  }
  client.stream.end();
  next(callback);
}

function next(callback) {
  if(callback)
    process.nextTick(callback);
}

module.exports = Server;
