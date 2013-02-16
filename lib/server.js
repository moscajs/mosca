
var mqtt = require("mqtt");
var async = require("async");

function Server(opts, callback) {
  this.opts = opts;
  opts.port = opts.port || 1883;

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
    that.server.close(callback);
  });
};

Server.prototype.serve = function (client) {

  var that = this;

  client.on("connect", function(packet) {
    client.id = packet.client;

    that.clients[client.id] = client;

    client.connack({ returnCode: 0 });
  });

  client.on("pingreq", function() {
    client.pingresp();
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
