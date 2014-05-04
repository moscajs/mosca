Mosca&nbsp;&nbsp;&nbsp;[![Build Status](https://travis-ci.org/mcollina/mosca.png)](https://travis-ci.org/mcollina/mosca)&nbsp;&nbsp;[![Coverage Status](https://coveralls.io/repos/mcollina/mosca/badge.png)](https://coveralls.io/r/mcollina/mosca)
====================




[![MOSCA](http://cloud.dynamatik.com/image/3I3I0q1M1x0E/mosca_small.png)](https://github.com/mcollina/mosca)

[![NPM](https://nodei.co/npm/mosca.png)](https://nodei.co/npm/mosca/)

[![NPM](https://nodei.co/npm-dl/mosca.png)](https://nodei.co/npm/mosca/)

##About
####Mosca is a node.js mqtt broker, which can be used:

* <a href="https://github.com/mcollina/mosca/wiki/Mosca-as-a-standalone-service.">Standalone</a>
* <a href="https://github.com/mcollina/mosca/wiki/Mosca-basic-usage">Embedded in another Node.js application</a>

Mosca officially support only node v0.10 but v0.11.x should work too.
Node v0.8 is not supported.


## Features

* MQTT 3.1 compliant.
* QoS 0 and QoS 1.
* Various storage options for QoS 1 offline packets, and subscriptions.
* As fast as it is possible.
* Usable inside ANY other node.js app.

<a name="standalone"></a>


##How to's/Tutorials 
All to be found [on our repository wiki section.](https://github.com/mcollina/mosca/wiki)

OR


or read the [dox generated documentation](http://mcollina.github.io/mosca/docs).


###Learn more
See the slides of my talk ["MQTT and Node.js - Messaging in the Internet
of Things"](http://mcollina.github.io/mqtt_and_nodejs/).

You can find a test version of mosca at test.mosca.io.
You can use ws://test.mosca.io/ to connect to the WebSocket tunnel.
This is powered by the [docker image](#docker-support).


If you like Mosca, consider supporting the project by donating via
[Gittip](https://www.gittip.com/mcollina/), or hire [me](http://twitter.com/matteocollina)
to get you started and solve any issue you might find.
Also, check out our [Usage in the
Wild](https://github.com/mcollina/mosca/wiki/Usage-in-the-Wild) wiki
page! Feel free to add yourself! :)




## Feedback

Use the [issue tracker](http://github.com/mcollina/mosca/issues) for bugs.
[Tweet](http://twitter.com/matteocollina) us for any idea that can improve the project.


## Links

* [GIT Repository](http://github.com/mcollina/mosca)
* [Mosca Documentation](http://mcollina.github.io/mosca/docs)
* [Ascoltatori](http://github.com/mcollina/ascoltatori)
* [MQTT protocol](http://mqtt.org)
* [MQTT.js](http://github.com/adamvr/MQTT.js)


## Authors

[Matteo Collina](http://twitter.com/matteocollina)

## Contributors

<table><tbody>
<tr><th align="left">David Halls</th><td><a
href="https://github.com/davedoesdev">GitHub/davedoesdev</a></td>
</tr>
<tr><th align="left">Andrea Reginato</th><td><a
href="https://github.com/andreareginato">GitHub/andreareginato</a></td>
</tr>
<tr><th align="left">Chris Wiggins</th><td><a
href="https://github.com/chriswiggins">GitHub/chriswiggins</a></td>
<tr><th align="left">Samir Naik</th><td><a
href="https://github.com/samirnaik">GitHub/samirnaik</a></td>
<tr><th align="left">Leo Steiner</th><td><a
href="https://github.com/ldstein">GitHub/ldstein</a></td>
<tr><th align="left">John Kokkinidis</th><td><a
href="https://github.com/SudoPlz">GitHub/SudoPlz</a></td>
</tbody></table>

## Logo
[Sam Beck](http://two-thirty.tumblr.com)


## LICENSE - "MIT License"

Copyright (c) 2013-2014 Matteo Collina, http://matteocollina.com

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
