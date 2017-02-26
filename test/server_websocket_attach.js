var mqtt = require('mqtt');
var websocket = require('ws');
var http = require('http');

var port = nextPort();
var path = '/test';
var mqttPath = '/mqttws';
var mqttTopic = 'atopic';
var ping = 'ping';
var pong = 'pong';

describe("mosca.Server - Mqtt-over-WS attached to existing http server", function() {
  var server, mqttServ;

  beforeEach(function(){
    server = http.createServer();
    mqttServ = new mosca.Server({interfaces:[]});
  });

  afterEach(function(){
    server.close();
  });

  it("should not occupy 1883 port while attached to http server", function(done) {
    mqttServ.attachHttpServer(server);
    server.listen(1883, done);
  });

  it("should be able to do mqtt over WebSocket", function(done) {
    mqttServ.attachHttpServer(server);
    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port);
      client.subscribe(mqttTopic);
      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        done();
      });
      client.publish(mqttTopic, ping);
    });
  });

  it("should be able to do mqtt over WebSocket on specific path", function(done) {
    mqttServ.attachHttpServer(server, mqttPath);
    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + mqttPath);
      client.subscribe(mqttTopic);
      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        done();
      });
      client.publish(mqttTopic, ping);
    });
  });

  it("should not be able to do mqtt over WebSocket on different path", function(done) {
    mqttServ.attachHttpServer(server, mqttPath);
    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + '/junk');
      client.subscribe(mqttTopic);
      var failed = false;// ensuring done is called once
      client.on("message", function(topic, payload) {
        failed = true;
        done(failed);
      });
      client.publish(mqttTopic, ping);
      setTimeout(function(){
        if (!failed){
          done();
        }
      }, 3000);
    });
  });

  it("should not be able to do mqtt over WebSocket on root path", function(done) {
    mqttServ.attachHttpServer(server, mqttPath);
    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port);
      client.subscribe(mqttTopic);
      var failed = false;
      client.on("message", function(topic, payload) {
        failed = true;
        done(failed);
      });
      client.publish(mqttTopic, ping);
      setTimeout(function(){
        if (!failed){
          done();
        }
      }, 2000);
    });
  });
});

describe("mosca.Server - Websocket and Mqtt-over-WS attached to the same http server", function() {
  var server, mqttServ, wss;

  beforeEach(function(){
    server = http.createServer();
    mqttServ = new mosca.Server({interfaces:[]});

    wss = new websocket.Server({
      server: server,
      path: path,
      perMessageDeflate: false
    });
  });

  afterEach(function(){
    server.close();
  });

  it("ws client should not connect when mqtt is attached to http server without path", function(done) {
    mqttServ.attachHttpServer(server);
    server.listen(port, function(){
      var ws = new websocket('ws://localhost:' + port + path, {
        perMessageDeflate: false
      });

      ws.on('error', function(e) {
        expect(e).to.not.be.undefined;
        done();
      });
    });
  });

  it("ws client should be able to connect when specific path is used", function(done) {
    mqttServ.attachHttpServer(server, mqttPath);
    wss.on('connection', function(conn){
      conn.on('message', function(msg){
        expect(msg).to.equal(ping);
        conn.send(pong);
      });
    });

    server.listen(port, function(){
      var ws = new websocket('ws://localhost:' + port + path, {
        perMessageDeflate: false
      });

      ws.on('open', function(){
        ws.send(ping);
      });

      ws.on('message', function(msg){
        expect(msg).to.equal(pong);
        done();
      });
    });
  });

  it("mqtt client should be able to connect as well", function(done) {
    mqttServ.attachHttpServer(server, mqttPath);
    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + mqttPath);
      client.subscribe(mqttTopic);
      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        done();
      });
      client.publish(mqttTopic, ping);
    });
  });

  it("both ws and mqtt client should be able to connect at the same time", function(done) {
    mqttServ.attachHttpServer(server, mqttPath);
    wss.on('connection', function(conn){
      conn.on('message', function(msg){
        expect(msg).to.equal(ping);
        conn.send(pong);
      });
    });

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + mqttPath);
      var ws = new websocket('ws://localhost:' + port + path, {
        perMessageDeflate: false
      });

      client.on('connect', function () {
        client.subscribe(mqttTopic);
        setTimeout(function(){// wait for ws to connect
          ws.send(ping);
        }, 2000);
      });

      ws.on('message', function(msg){
        expect(msg).to.equal(pong);
        client.publish(mqttTopic, ping);
      });

      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        done();
      });
    });
  });
});
