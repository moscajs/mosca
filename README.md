Mosca
=====

[![Build
Status](https://travis-ci.org/mcollina/mosca.png)](https://travis-ci.org/mcollina/mosca)

__Mosca__ is a multi-transport [MQTT](http://mqtt.org/) broker.
It aims to support every publish/subscribe
broker or protocol out there.
This list currently includes:

* [RabbitMQ](http://www.rabbitmq.com/) and all implementations of
  the [AMQP](http://www.amqp.org/) protocol.
* [Redis](http://redis.io/), the fabulous key/value store by
  [@antirez](https://github.com/antirez).
* [Mosquitto](http://mosquitto.org/) and all implementations of the
  [MQTT](http://mqtt.org/) protocol, including itself.
* [ZeroMQ](http://www.zeromq.org/) without a central broker, so
  Mosca can also be used in a P2P fashion.


__Mosca__ is still under active development, but it should work :).
Let me know if you plan to use __Mosca__ in production.

## Usage

Mosca is a node.js application, so it needs [node.js](http://nodejs.org)
to run.

```
$: npm install mosca -g
$: mosca -v
```

Then you can connect to it with your preferred [MQTT](http://mqtt.org)
client.

## Features

* MQTT 3.1 compliant
* QoS 0 and QoS 1, but without storage
* Built on top on node.js
* As fast as it is possible
* Usable inside ANY other node.js app, see the
  [API](http://mcollina.github.com/mosca/docs/server.js.html).

## Configuration

Mosca supports some command line options:

```
Usage: mosca [options]

  Options:

    -h, --help           output usage information
    -V, --version        output the version number
    -p, --port <n>       the port to listen to
    --parent-port <n>    the parent port to connect to
    --parent-host <s>    the parent host to connect to
    --parent-prefix <s>  the prefix to use in the parent broker
    -c, --config <c>     the config file to use (override every 
                         other options)
    -v, --verbose        equal to DEBUG=mosca
    --very-verbose       equal to DEBUG=mosca,ascoltatori:*
```

However you can only use a MQTT backend with the command line options.

If you want to unleash the full power of mosca, you will need to
use a configuration file.
Some examples are included in this repository, one using
[Redis](https://github.com/mcollina/mosca/tree/master/examples/redis),
and one using a
[tree-based](https://github.com/mcollina/mosca/tree/master/examples/mosca-tree) topology of Moscas.

A configuration file is structured in the following way:
```
module.exports = {
  port: 4883,
  backend: {
    type: "redis"
  }
};
```

As __Mosca__ is based on
[Ascoltatori](http://mcollina.github.com/ascoltatori/) to integrate
all backends, please refer to __Ascoltatori__'s documentation to set
them up accordingly.
The whole content of the `backend` key is passed through to the
[ascoltatori.build](http://mcollina.github.com/ascoltatori/docs/ascoltatori.js.html#build)
method.

## Contributing to Mosca

* Check out the latest master to make sure the feature hasn't been
  implemented or the bug hasn't been fixed yet
* Check out the issue tracker to make sure someone already hasn't
  requested it and/or contributed it
* Fork the project
* Start a feature/bugfix branch
* Commit and push until you are happy with your contribution
* Make sure to add tests for it. This is important so I don't break it
  in a future version unintentionally.
* Please try not to mess with the Makefile and package.json. If you
  want to have your own version, or is otherwise necessary, that is
  fine, but please isolate to its own commit so I can cherry-pick around
  it.

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
