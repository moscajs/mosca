
# MQTT and Node.js

<p style="text-align: center; font-size: 20px;">
Messagging in the Internet of Things
</p>

<p style="text-align: center; font-size: 15px; padding-top: 30px;">
Twitter: @matteocollina
</p>
<p style="text-align: center; font-size: 15px;">
GitHub: @mcollina
</p>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## MQTT

<img src="img/pubsub.png" style="height: 400px; margin-top: -100px;
margin-left: -50px;">

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## MQTT.js

### &nbsp;&nbsp;&nbsp;&nbsp;&hellip; http://npm.im/mqtt
### &nbsp;&nbsp;&nbsp;&nbsp;&hellip; 20k packets/second parser
### &nbsp;&nbsp;&nbsp;&nbsp;&hellip; Stream based
### &nbsp;&nbsp;&nbsp;&nbsp;&hellip; High-Level Client API
### &nbsp;&nbsp;&nbsp;&nbsp;&hellip; Low-Level Server
### &nbsp;&nbsp;&nbsp;&nbsp;&hellip; Built by @adamvr and @mcollina

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 
## Instant Gratification

```js
var mqtt = require("mqtt");

var client = mqtt.createClient();

client.subscribe("mqtt/demo");

client.on("message", function(topic, payload) {
  alert([topic, payload].join(": "));
  client.end();
});

client.publish("mqtt/demo", "hello world!");
```

<a href="#" onclick="runCurrentScript(); return false;">Run!</a>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 
## Pattern Matching

```js
var mqtt = require("mqtt");

var client = mqtt.createClient();

client.subscribe("mqtt/+");

client.on("message", function(topic, payload) {
  alert([topic, payload].join(": "));
  client.end();
});

client.publish("mqtt/demo", "hello world!");
```

<a href="#" onclick="runCurrentScript(); return false;">Run!</a>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 
## Receiving a message from a Thing

```js
var mqtt = require("mqtt");

var client = mqtt.createClient();

client.subscribe("mqtt/demo");

client.on("message", function(topic, payload) {
  alert([topic, payload].join(": "));
  client.end();
});
```

<a href="#" onclick="runCurrentScript(); return false;">Run!</a>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## How can it work on a Browser?

* MQTT.js can be tunnelled inside WebSocket/Engine.io/any binary stream
* The previous example runned inside the browser using WebSocket
* MQTT over Websocket is 'standard' and supported by IBM MQ, Mosquitto
  and Hive [link](http://mqtt.org/wiki/doku.php/mqtt_over_websockets).
* Thanks @substack for Browserify

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Mosca: MQTT broker in Node.js

<ul>
  <li data-bespoke-bullet> http://npm.im/mosca</li>
  <li data-bespoke-bullet> Standalone usage, through `$ mosca`</li>
  <li data-bespoke-bullet> Embeddable in your app</li>
  <li data-bespoke-bullet> Authentication APIs</li>
  <li data-bespoke-bullet> Supports AMQP, Mongo, and MQTT as pub/sub backends (if you need them)</li>
  <li data-bespoke-bullet> Needs a DB, such as LevelUp, Mongo, or Redis</li>
  <li data-bespoke-bullet> Support websockets (not yet published, [mcollina/mosca#44](https://github.com/mcollina/mosca/pull/44))</li>
  <li data-bespoke-bullet> Fast, 10k+ messages routed per second</li>
</ul>
 
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Mosca: Benchmark

<img src="img/moscabench.svg" style="margin-top: 20px; margin-left:
100px; width:250px;">

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Offline Mode

First, subscribe and disconnect.

```js
var mqtt = require("mqtt");

var client = mqtt.createClient({
  clientId: "moscaslides",
  clean: false
}).subscribe("mosca/demo/offline", { qos: 1 }, function() {
  alert("subscribe done!");
  // called when the subscribe is successful
  client.end();
});
```

<a href="#" onclick="runCurrentScript(true); return false;">Run!</a>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Offline Mode

Then, someone else publish an important message:

```js
var mqtt = require("mqtt");

var client = mqtt.createClient();

client.publish("mosca/demo/offline", 
               "hello world!", 
               { qos: 1 }, function() {
  alert("publish done!");
  client.end();
});
```

<a href="#" onclick="runCurrentScript(); return false;">Run!</a>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Offline Mode

When our first client reconnect, it receives all the missed messages, in
order.

```js
var mqtt = require("mqtt");

var client = mqtt.createClient({
  clientId: "moscaslides",
  clean: false
});

client.on("message", function(topic, payload) {
  alert([topic, payload.toString()].join(": "));

  setTimeout(client.end.bind(client), 1000);
});
```

<a href="#" onclick="runCurrentScript(true); return false;">Run!</a>

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Does Offline Mode Scale?

<img src="img/moscavsmosquitto.svg" style="margin-top: 20px; margin-left:
100px; width:250px;">

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

# Thanks!

<p style="text-align: center; font-size: 20px;">
Twitter: @matteocollina
</p>
<p style="text-align: center; font-size: 20px;">
GitHub: @mcollina
</p>

