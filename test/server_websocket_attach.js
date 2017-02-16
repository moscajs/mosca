var mqtt = require('mqtt')
var websocket = require('ws');
var http = require('http');

var port = nextPort();
var path = '/test';
var mqttPath = '/mqttws';
var mqttTopic = 'atopic';
var ping = 'ping';
var pong = 'pong';

describe("mosca.Server - Mqtt-over-WS attached to existing http server", function() {
  
  var mqttServ
  var server

  afterEach(function(done){
    server.close();
    mqttServ.close(done);
  })

  it("should be able to do mqtt over WebSocket", function(done) {
    server = http.createServer();
    mqttServ = new mosca.Server({});
    mqttServ.attachHttpServer(server);

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port);
      client.subscribe(mqttTopic);
      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        server.close();
        mqttServ.close(done);
      });
      client.publish(mqttTopic, ping);
    });
  });

  it("should be able to do mqtt over WebSocket on specific path", function(done) {
    server = http.createServer();
    mqttServ = new mosca.Server({});
    mqttServ.attachHttpServer(server, mqttPath);

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + mqttPath);
      client.subscribe(mqttTopic);
      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        server.close();
        mqttServ.close(done);
      });
      client.publish(mqttTopic, ping);
    });
  });

  it("should not be able to do mqtt over WebSocket on different path", function(done) {
    server = http.createServer();
    mqttServ = new mosca.Server({port:3333});// async test, preventing intefere with other tests that spawn on 1883 port
    mqttServ.attachHttpServer(server, mqttPath);

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + '/junk');
      client.subscribe(mqttTopic);
      var failed = false;
      client.on("message", function(topic, payload) {
        failed = true;
        done(failed)
      });
      client.publish(mqttTopic, ping);
      setTimeout(function(){
        if (!failed){
          done()
        }
      }, 2000);
    });
  });

  it("should not be able to do mqtt over WebSocket on root path", function(done) {
    var server = http.createServer();
    var mqttServ = new mosca.Server({port:3333});
    mqttServ.attachHttpServer(server, mqttPath);

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port);
      client.subscribe(mqttTopic);
      var failed = false;
      client.on("message", function(topic, payload) {
        failed = true;
        mqttServ.close(function(){
          done(failed);
        }); 
      });
      client.publish(mqttTopic, ping);
      setTimeout(function(){
        if (!failed){
          server.close();
          mqttServ.close(done); 
        }
      }, 2000);
    });
  });

  //TODO: this test failed, what does the spec say?
  xit("should not be able to do mqtt over WebSocket on a specific path without attaching to any path", function(done) {
    var server = http.createServer();
    var mqttServ = new mosca.Server({port:3333});
    mqttServ.attachHttpServer(server);

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + mqttPath);
      client.subscribe(mqttTopic);
      var failed = false;
      client.on("message", function(topic, payload) {
        failed = true;
        mqttServ.close(function(){
          done(failed);
        }); 
      });
      client.publish(mqttTopic, ping);
      setTimeout(function(){
        if (!failed){
          server.close();
          mqttServ.close(done); 
        }
      }, 2000);
    });
  });
});

describe("mosca.Server - Websocket and Mqtt-over-WS attached to the same http server", function() {
  it("ws client should not connect when mqtt is attached to http server without path", function(done) {
    var server = http.createServer();
    var wss = new websocket.Server({
      server: server,
      path: path,
      perMessageDeflate: false
    });
    var mqttServ = new mosca.Server({});
    mqttServ.attachHttpServer(server);

    server.listen(port, function(){
      var ws = new websocket('ws://localhost:' + port + path, {
        perMessageDeflate: false
      });

      ws.on('error', function(e) {
        expect(e).to.not.be.undefined;
        server.close();
        mqttServ.close(done); 
      });
    });
  });

  it("ws client should be able to connect when specific path is used", function(done) {
    var server = http.createServer();
    var wss = new websocket.Server({
      server: server,
      path: path,
      perMessageDeflate: false
    });
    wss.on('connection', function(conn){
      conn.on('message', function(msg){
        expect(msg).to.equal(ping);
        conn.send(pong);
      });
    });

    var mqttServ = new mosca.Server({});
    mqttServ.attachHttpServer(server, mqttPath);

    server.listen(port, function(){
      var ws = new websocket('ws://localhost:' + port + path, {
        perMessageDeflate: false
      });

      ws.on('open', function(){
        ws.send(ping);
      });

      ws.on('message', function(msg){
        expect(msg).to.equal(pong);
        server.close();
        mqttServ.close(done);
      });
    });
  });


  it("mqtt client should be able to connect as well", function(done) {
    var server = http.createServer();
    var wss = new websocket.Server({
      server: server,
      path: path,
      perMessageDeflate: false
    });

    var mqttServ = new mosca.Server({});
    mqttServ.attachHttpServer(server, mqttPath);

    server.listen(port, function(){
      var client = mqtt.connect('ws://localhost:' + port + mqttPath);
      client.subscribe(mqttTopic);
      client.on("message", function(topic, payload) {
        expect(topic).to.equal(mqttTopic);
        expect(payload.toString()).to.equal(ping);
        server.close();
        mqttServ.close(done);
      });
      client.publish(mqttTopic, ping);
    });
  });
});
