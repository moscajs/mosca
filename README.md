Mosca&nbsp;&nbsp;&nbsp;[![Build Status](https://travis-ci.org/mcollina/mosca.svg)](https://travis-ci.org/mcollina/mosca)&nbsp;&nbsp;[![Coverage Status](https://coveralls.io/repos/mcollina/mosca/badge.svg)](https://coveralls.io/r/mcollina/mosca)
====================

[![MOSCA](http://cloud.dynamatik.com/image/3I3I0q1M1x0E/mosca_small.png)](https://github.com/mcollina/mosca)

[![NPM](https://nodei.co/npm/mosca.png)](https://nodei.co/npm/mosca/)

[![NPM](https://nodei.co/npm-dl/mosca.png)](https://nodei.co/npm/mosca/)

##About

####Mosca is a node.js mqtt broker, which can be used:

* <a href="https://github.com/mcollina/mosca/wiki/Mosca-as-a-standalone-service.">Standalone</a>
* <a href="https://github.com/mcollina/mosca/wiki/Mosca-basic-usage">Embedded in another Node.js application</a>

## Features

* MQTT 3.1 and 3.1.1 compliant.
* QoS 0 and QoS 1.
* Various storage options for QoS 1 offline packets, and subscriptions.
* Usable inside ANY other Node.js app.
* version 2.0.0+ targets node v6, v4 and v0.12
* version 1.0.0+ targets node v6, v5, v4 and v0.12, with partial support for node v0.10.

##Quickstart

### Standalone

```bash
npm install mosca pino -g
mosca -v | pino
```

### Embedded

```bash
npm install mosca --save
```

Show me some code:

```javascript
var mosca = require('mosca');

var ascoltatore = {
  //using ascoltatore
  type: 'mongo',
  url: 'mongodb://localhost:27017/mqtt',
  pubsubCollection: 'ascoltatori',
  mongo: {}
};

var settings = {
  port: 1883,
  backend: ascoltatore
};

var server = new mosca.Server(settings);

server.on('clientConnected', function(client) {
    console.log('client connected', client.id);
});

// fired when a message is received
server.on('published', function(packet, client) {
  console.log('Published', packet.payload);
});

server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
  console.log('Mosca server is up and running');
}
```

All the info to get you started is gathered [in this wiki page](https://github.com/mcollina/mosca/wiki/Mosca-basic-usage)

Also there is an example using [Redis](https://github.com/mcollina/mosca/wiki/Mosca-basic-usage#in-this-example-we-will-be-using-redis)

## How to's/Tutorials

All to be found [on our repository wiki section.](https://github.com/mcollina/mosca/wiki)

OR

read the [dox generated documentation](http://mcollina.github.io/mosca/docs).


### Learn more

See the slides of my talk ["MQTT and Node.js - Messaging in the Internet
of Things"](http://mcollina.github.io/mqtt_and_nodejs/).

You can find a test version of mosca at test.mosca.io.
You can use ws://test.mosca.io/ to connect to the WebSocket tunnel.
This is powered by the [docker image](https://github.com/mcollina/mosca/wiki/Docker-support).

If you find Mosca useful, consider supporting the project by buying a support package
from [me](http://twitter.com/matteocollina) by writing an email to hello@matteocollina.com.

Check out our [showcase](https://github.com/mcollina/mosca/wiki/Mosca-Showcase) wiki
page! Feel free to add yourself! :)

## Security Issues

__Mosca__ sits between your system and the devices: this is a tough role, and we did our best to secure your systems.
However, you might find a security issue: in that case, email @mcollina at hello@matteocollina.com.


## Feedback

Use the [issue tracker](http://github.com/mcollina/mosca/issues) for bugs.
[Tweet](http://twitter.com/matteocollina) us for any idea that can improve the project.
Chat with us on [Mosca's room](https://gitter.im/mcollina/mosca) on Gitter.


## Links

* [GIT Repository](http://github.com/mcollina/mosca)
* [Mosca Documentation](http://mcollina.github.io/mosca/docs)
* [Ascoltatori](http://github.com/mcollina/ascoltatori)
* [MQTT protocol](http://mqtt.org)
* [MQTT.js](http://github.com/adamvr/MQTT.js)

## Authors

[Matteo Collina](http://twitter.com/matteocollina)

## Logo
[Sam Beck](http://two-thirty.tumblr.com)


## LICENSE - "MIT License"

Copyright (c) 2013-2016 Matteo Collina, http://matteocollina.com

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
