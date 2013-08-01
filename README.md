# Mosca

![Mosca](https://raw.github.com/mcollina/mosca/master/mosca.png)

[![Build Status](https://travis-ci.org/mcollina/mosca.png)](https://travis-ci.org/mcollina/mosca)

Mosca is a multi-transport [MQTT](http://mqtt.org/) broker
supporting the following brokers/protocols.

* [Redis](http://redis.io/), a key/value store created by [@antirez](https://github.com/antirez).
* [MongoDB](http://www.mongodb.org/), a scalable, high-performance, document-oriented database.
* [Mosquitto](http://mosquitto.org/) and all implementations of the [MQTT](http://mqtt.org/) protocol.
* [RabbitMQ](http://www.rabbitmq.com/) and all implementations of the [AMQP](http://www.amqp.org/) protocol.
* [ZeroMQ](http://www.zeromq.org/) to use Ascoltatori in a P2P fashion.


Find out more about Mosca reading the
[dox generated documentation](http://mcollina.github.io/mosca/docs).
Note that Mosca is under active development. if you plan to use Mosca in production
[let us know ](http://twitter.com/matteocollina), we'll be more than happy to help
you getting started and solve any issue you'll find out.


## Features

* MQTT 3.1 compliant
* QoS 0 and QoS 1
* Various storage options for QoS 1 offline packets, and subscriptions
* As fast as it is possible
* Usable inside ANY other node.js app.


## Install

Install the client library using [npm](http://npmjs.org/).

```
$ npm install mosca bunyan -g
```

Install the client library using git.

```
$ git clone git://github.com/mcollina/mosca.git
$ cd mosca
$ npm install
```


## Getting Started

Mosca can be used into any Node.js app. Here an example that uses MongoDB as broker.

```javascript
var mosca = require('mosca')

var ascoltatore = {
  type: 'mongo',
  uri: 'mongodb://localhost:27017/',
  db: 'mqtt',
  pubsubCollection: 'ascoltatori',
  mongo: {}
};

var settings = {
  port: 1883,
  backend: ascoltatore
};

var server = new mosca.Server(settings);
server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
  console.log('Mosca server is up and running')
}

// fired when a message is published
server.on('published', function(packet, client) {
  console.log('Published', packet.payload);
});
```

### Mosca explained

Mosca is based on [Ascoltatori](https://github.com/mcollina/ascoltatori), a simple
publish/subscribe library supporting different brokers/protocols such as Redis,
MongoDB, RabbitMQ, Mosquitto, and ZeroMQ. This means that you can use any of the
listed solutions to let your MQTT client communicate with any service.

#### MQTT Client Publish Example

This is a Node.js MQTT client publishing on a topic.

```javascript
var mqtt = require('mqtt')
  , host = 'localhost'
  , port = '1883';

var settings = {
  keepalive: 1000,
  protocolId: 'MQIsdp',
  protocolVersion: 3,
  clientId: 'client-1'
}

// client connection
var client = mqtt.createClient(port, host, settings);

// client publishing a sample JSON
client.publish('hello/you', '{ "hello": "you" }');
```

This message will be received from the Mosca Server and any Ascoltatore
who has subscribed to this topic will automatically receive the message.

```javascript
var ascoltatori = require('ascoltatori');
var settings = {
  type: 'mongo',
  uri: 'mongodb://localhost:27017/',
  db: 'mqtt',
  pubsubCollection: 'ascoltatori',
  mongo: {}
};

ascoltatori.build(settings, function (ascoltatore) {
  ascoltatore.subscribe('hello/*', function() {
    console.log('Received message', arguments);
  });
});
```

With the same logics, a client subscribing to the Mosca Server to a specific
topic will get notified everytime an element will be added through Ascoltatori.

#### MQTT Client Subscribe Example

This is a Node.js MQTT client subscribing a topic.

```javascript
var mqtt = require('mqtt')
  , host = 'localhost'
  , port = '1883';

var settings = {
  keepalive: 1000,
  protocolId: 'MQIsdp',
  protocolVersion: 3,
  clientId: 'client-1'
}

// client connection
var client = mqtt.createClient(port, host, settings);

// client subscription
client.subscribe('hello/me')
client.on('message', function(topic, message) {
  console.log('received', topic, message);
});
```

When an Ascoltatore publish a message on the subscribed topic, the Mosca
Server will forward it to the subscribing client.

```javascript
var ascoltatori = require('ascoltatori');
var settings = {
  type: 'mongo',
  uri: 'mongodb://localhost:27017/',
  db: 'mqtt',
  pubsubCollection: 'ascoltatori',
  mongo: {}
};

ascoltatori.build(settings, function (_ascoltatore) {
  ascoltatore.publish('hello/me', '{ "hello": "you" }');
});
```


## Mosca Client

Mosca offers a Node.js client application. Run it and connect your preferred client.

```
$ mosca -v | bunyan
```


### Client configuration

Here you can see the options accepted by the client.

```
  Usage: mosca [options] [command]

  Commands:

    adduser <user> <pass>  Add a user to the given credentials file
    rmuser <user>          Removes a user from the given credentials file
    start                  start the server (optional)

  Options:

    -h, --help                       output usage information
    -V, --version                    output the version number
    -p, --port <n>                   the port to listen to
    --parent-port <n>                the parent port to connect to
    --parent-host <s>                the parent host to connect to
    --parent-prefix <s>              the prefix to use in the parent broker
    --credentials <file>             the file containing the credentials
    --authorize-publish <pattern>    the pattern for publishing to topics for the added user
    --authorize-subscribe <pattern>  the pattern for subscribing to topics for the added user
    -c, --config <c>                 the config file to use (override every other option)
    -d, --db <path>                  the path were to store the database
    -v, --verbose                    set the bunyan log to INFO
    --very-verbose                   set the bunyan log to DEBUG
```


To fully use mosca you need to define a configuration file where the communication
broker is defined. Here follows an example using Redis.

```javascript
module.exports = {
  port: 4883,
  backend: {
    type: 'redis',
    redis: require('redis'),
    db: 12,
    port: 6379,
    host: localhost
  }
};
```

Ad Mosca is based on Ascoltatori, [here](http://mcollina.github.com/ascoltatori#brokers) you can
find configuration examples covering Redis, MongoDB, AMQP, ZeroMQ and and MQTT brokers (e.g Mosquitto).


### Client Authorization

Mosca supports user authentication through the use of a specific json file.
In order to create one run the following command.

```javascript
// add a user
$ mosca adduser <user> <pass> --credentials ./credentials.json

// add a user specifying the authorized topics
$ mosca adduser myuser mypass --credentials ./credentials.json \
  --authorize-publish 'hello/*' --authorize-subscribe 'hello/*'

// remove a user
$ mosca rmuser myuser --credentials ./credentials.json

// start Mosca with a specific set of credentials:
$ mosca --credentials ./credentials.json
```

The patterns are checked and validated using [Minimatch](https://github.com/isaacs/minimatch).
The credentials file can be automatically reladed by Mosca if it receives a `SIGHUP`.


## Persistence

The MQTT specification requires a persistent storage for offline QoS 1
subscription that has been done by an unclean client. Mosca offers several
persitance options.

* [Redis](http://mcollina.github.com/mosca/docs/lib/persistence/redis.js.html)
* [MongoDB](http://mcollina.github.com/mosca/docs/lib/persistence/mongo.js.html)
* [LevelUp](http://mcollina.github.com/mosca/docs/lib/persistence/levelup.js.html)
* [Memory](http://mcollina.github.com/mosca/docs/lib/persistence/memory.js.html)

All of them can be configured from the configuration file, under the `persistence` key.
The only exception is LevelUp, which can be specified by using the `--db` option from
the command line.


## Contributing

Fork the repo on github and send a pull requests with topic branches.
Do not forget to provide specs to your contribution.


### Running specs

* Fork and clone the repository
* Run `npm install`
* Run `npm test`


## Coding guidelines

Follow [felix](http://nodeguide.com/style.html) guidelines.


## Feedback

Use the [issue tracker](http://github.com/mcollina/ascoltatori/issues) for bugs.
[Tweet](http://twitter.com/matteocollina) us for any idea that can improve the project.


## Links

* [GIT Repository](http://github.com/mcollina/mosca)
* [Mosca Documentation](http://mcollina.github.io/mosca/docs)
* [Ascoltatori](http://github.com/mcollina/ascoltatori)


## Authors

[Matteo Collina](http://twitter.com/matteocollina)


## Contributors

Special thanks to the [following people](https://github.com/mcollina/mosca/contributors) for submitting patches.


## LICENSE - "MIT License"

Copyright (c) 2013 Matteo Collina, http://matteocollina.com

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
