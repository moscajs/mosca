"use strict";

var async = require("async");

function Client(mqttClient, server) {
  this.client = mqttClient;
  this.server = server;
  this.logger = server.logger;
  this.subscriptions = {};

  this.nextId = 0;
  this.inflight = {};

  this.setup();
}

Client.prototype.setup = function() {
  var that = this, logger = this.logger, client = that.client;

  this.buildForward();

  client.on("connect", function(packet) {
    that.handleConnect(packet);
  });

  client.on("puback", function(packet) {
    that.handlePuback(packet);
  });

  client.on("pingreq", function() {
    logger.debug("pingreq");
    that.setUpTimer();
    that.client.pingresp();
  });

  client.on("subscribe", function(packet) {
    that.handleSubscribe(packet);
  });

  client.on("publish", function(packet) {
    that.server.authorizePublish(client, packet.topic, packet.payload, function(err, success) {
      that.handleAuthorizePublish(err, success, packet);
    })
  });

  client.on("unsubscribe", function(packet) {
    logger.info({ packet: packet }, "unsubscribe received");
    async.parallel(packet.unsubscriptions.map(that.unsubscribeMapTo.bind(that)), function(err) {
      if (err) {
        logger.warn(err);
        that.unsubAndClose();
        return;
      }
      client.unsuback({
        messageId: packet.messageId
      });
    });
  });

  client.on("disconnect", function() {
    logger.debug("disconnect requested");
    that.unsubAndClose();
  });

  client.on("error", function(err) {
    logger.warn(err);
    that._closed = true;
  });

  client.on("close", function() {
    logger.info("disconnected");
    that._closed = true;
  });

  client.on("close", function() {
    that.onClose();
  });
};

Client.prototype.setUpTimer = function() {
  if (this.timer) {
    clearTimeout(this.timer);
  }

  var timeout = this.keepalive * 1000 * 5 / 4;
  var that = this;

  this.logger.info({ timeout: timeout }, "setting keepalive timeout");

  this.timer = setTimeout(function() {
    that.logger.info("keepalive timeout");
    that.close();
  }, timeout);
};

Client.prototype.actualSend = function(packet, retry) {
  var that = this;

  if (retry === 10) {
    this.logger.info({ packet: packet }, "could not deliver the message");
    this.client.emit("error", new Error("client not responding to acks"));
    return;
  }

  this.logger.debug({ packet: packet, retry: retry }, "sending packet");

  this.client.publish(packet);

  if (packet.qos === 1) {
    this.logger.debug({ packet: packet, retry: retry }, "setting up the resend timer");
    this.inflight[packet.messageId] = setTimeout(function() {
      retry++;
      that.actualSend(packet, retry);

      // exponential backoff algorithm
    }, this.server.opts.baseRetryTimeout * Math.pow(2, retry));
  }
};

Client.prototype.buildForward = function() {
  var that = this;
  this.forward = function(topic, payload, options, subTopic, initialQoS) {
    that.logger.info({ topic: topic }, "delivering message");

    if (that._closed) {
      return;
    }

    var pubQoS = options && options.qos,
        sub = that.subscriptions[subTopic],
        subQoS = sub && sub.qos,
        qos = Math.min(pubQoS || 0,
                       (subQoS === undefined ? initialQoS : subQoS) || 0);

    var packet = {
      topic: topic,
      payload: payload,
      qos: qos,
      messageId: this.nextId++
    };

    that.actualSend(packet, 0);
  };
};

Client.prototype.unsubscribeMapTo = function(topic) {
  var that = this;
  return function(cb) {
    var sub = that.subscriptions[topic],
    handler = (sub && sub.handler) || that.forward;
    that.server.ascoltatore.unsubscribe(topic.replace("#", "*"), handler, function(err) {
      if (err) {
        cb(err);
        return;
      }
      that.logger.info({ topic: topic }, "unsubscribed");
      delete that.subscriptions[topic];
      cb();
    });
  };
};

Client.prototype.unsubAndClose = function(cb) {
  var that = this;
  //that.client.removeListener("close", that.onClose);
  async.parallel(Object.keys(that.subscriptions).map(that.unsubscribeMapTo.bind(that)), function() {
    that.close(cb);
  });
};

Client.prototype.handleConnect = function(packet) {
  var that = this, logger = this.logger, client = this.client;

  this.id = packet.clientId;
  logger = that.logger.child({ client: this });

  that.server.authenticate(this, packet.username, packet.password,
                           function(err, verdict) {

    if (err) {
      logger.info({ username: packet.username }, "authentication error");
      client.stream.end();
      that.client.emit("error", err);
      return;
    }

    if (!verdict) {
      logger.info({ username: packet.username }, "authentication denied");
      client.connack({
        returnCode: 5
      });
      client.stream.end();
      return;
    }

    that.keepalive = packet.keepalive;
    that.will = packet.will;

    logger.info("client connected");

    that.setUpTimer();
    client.connack({
      returnCode: 0
    });
    that.server.emit("clientConnected", that);
  })
};

Client.prototype.handlePuback = function(packet) {
  var logger = this.logger;

  logger.debug({ packet: packet }, "puback");
  if (this.inflight[packet.messageId]) {
    clearTimeout(this.inflight[packet.messageId]);
    delete this.inflight[packet.messageId];
  } else {
    logger.warn({ packet: packet }, "no such packet");
  }
}

function calculateGranted(client, packet) {
  return packet.subscriptions.map(function(e) {
    if (e.qos === 2) {
      e.qos = 1;
    }
    if (client.subscriptions[e.topic] !== undefined) {
      client.subscriptions[e.topic].qos = e.qos;
    }
    return e.qos;
  });
}

Client.prototype.handleAuthorizeSubscribe = function(err, success, s, cb) {
  if (err) {
    cb(err);
    return;
  }

  if (!success) {
    this.logger.info({ topic: s.topic }, "subscribe not authorized");
    cb("not authorized");
    return;
  }

  var that = this;

  var handler = function(topic, payload, options) {
    that.forward(topic, payload, options, s.topic, s.qos);
  };

  this.server.ascoltatore.subscribe(
    s.topic.replace("#", "*"),
    handler,
    function(err) {
      if (err) {
        cb(err);
        return;
      }
      that.logger.info({ topic: s.topic, qos: s.qos }, "subscribed to topic");
      that.subscriptions[s.topic] = { qos: s.qos, handler: handler };
      cb();
    }
  );
};

Client.prototype.handleSubscribe = function(packet) {
  var that = this, server = this.server, logger = this.logger;

  logger.debug({ packet: packet }, "subscribe received");

  var granted = calculateGranted(this, packet);
  var subs = packet.subscriptions.filter(function(s) {
    return that.subscriptions[s.topic] === undefined;
  });

  async.parallel(subs.map(function(s) {
    return function(cb) {
      server.authorizeSubscribe(that, s.topic, function(err, success) {
        that.handleAuthorizeSubscribe(err, success, s, cb);
      });
    };
  }), function(err) {
    if (err) {
      that.unsubAndClose();
      return;
    }
    that.client.suback({
      messageId: packet.messageId,
      granted: granted
    });
  });
};

Client.prototype.handleAuthorizePublish = function(err, success, packet) {
  var that = this;

  if (err || !success) {
    that.unsubAndClose();
    return;
  }

  var options = {
    qos: packet.qos,
    mosca: {
      client: this, // the client object
      packet: packet  // the packet being sent
    }
  };

  that.server.ascoltatore.publish(
    packet.topic,
    packet.payload,
    options,
    function() {
      that.logger.info({ packet: packet }, "published packet");

      if (packet.qos === 1) {
        that.client.puback({
          messageId: packet.messageId
        });
      }

      that.server.emit("published", packet, that);
    }
  );
}

Client.prototype.onClose = function() {
  var that = this, logger = that.logger;

  this.unsubAndClose(function() {
    if (that.will) {
      logger.info({ willTopic: that.will.topic }, "delivering last will");
      that.server.ascoltatore.publish(
        that.will.topic,
        that.will.payload,
        { qos: that.will.qos, clientId: that.id });
    }
  });
};

Client.prototype.close = function(callback) {
  var that = this;

  if (this.id) {
    that.logger.info("closing client");

    clearTimeout(this.timer);
  }

  var cleanup = function() {
    that._closed = true;

    // clears the inflights timeout here
    // as otherwise there might be one issued
    // after calling end()
    Object.keys(that.inflight).forEach(function(id) {
      clearTimeout(that.inflight[id]);
      delete that.inflight[id];
    });

    that.client.removeAllListeners();
    that.server.emit("clientDisconnected", that);
    if (callback) {
      callback();
    }
  };

  //client.removeListener("close", client._onclose);

  if (this._closed) {
    cleanup();
  } else {
    this.client.stream.on("end", cleanup);
    this.client.stream.end();
  }
};

module.exports = Client;
