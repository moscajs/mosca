global.sinon = require("sinon");
global.chai = require("chai");
global.expect = require("chai").expect;

global.redisSettings = function() {
  return {
    redis: require('redis')
  };
};

var portCounter = 30042;
global.nextPort = function() {
  return ++portCounter;
};

global.zeromqSettings = function(remote_ports) {
  return {
    zmq: require("zmq"),
    port: "tcp://127.0.0.1:" + global.nextPort()
  };
};

global.rabbitSettings = function() {
  return {
    amqp: require("amqp"),
    exchange: "ascolatore" + global.nextPort()
  };
};

global.moscaSettings = function() {
  return {
    port: nextPort()
  };
};

var sinonChai = require("sinon-chai");
chai.use(sinonChai);

global.mosca = require("../");
global.mosca.cli = require("../lib/cli");
