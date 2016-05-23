global.sinon = require("sinon");
global.chai = require("chai");
global.expect = require("chai").expect;

global.redisSettings = function() {
  return {
    redis: require('redis')
  };
};

var portCounter = 29042;
global.nextPort = function() {
  return ++portCounter;
};

global.buildOpts = function() {
  return {
    keepalive: 1000,
    clientId: 'mosca_' + require("crypto").randomBytes(8).toString('hex'),
    protocolId: 'MQIsdp',
    protocolVersion: 3
  };
};

global.donner = function(count, done) {
  return function() {
    count--;
    if (count === 0) {
      done();
    }
  };
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

var sinonChai = require("sinon-chai");
chai.use(sinonChai);

global.mosca = require("../");
global.mosca.cli = require("../lib/cli");
