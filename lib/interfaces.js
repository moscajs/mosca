/*
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
*/
"use strict";

var fs = require("fs");
var Connection = require("mqtt-connection");
var http = require("http");
var https = require("https");
var net =  require("net");
var tls = require("tls");
var st = require("st");

var Client = require("./client");

module.exports = {
  serverFactory: serverFactory,

  mqttFactory: mqttFactory,
  mqttsFactory: mqttsFactory,
  httpFactory: httpFactory,
  httpsFactory: httpsFactory,

  buildWrap: buildWrap,
  buildServe: buildServe,
};

/**
 * Build internal server for the interface.
 * 
 * @api private
 * @param  {Object} iface       Interface description
 * @param  {Object} fallback    Fallback values
 * @param  {mosca.Server} mosca Target mosca server
 * @return {any.Server}         Built server
 */
function serverFactory(iface, fallback, mosca) {
  var factories = {
    "mqtt":  mqttFactory,
    "mqtts": mqttsFactory,
    "http":  httpFactory,
    "https": httpsFactory,
  };

  var type = iface.type; // no fallback
  var factory = factories[type] || type;
  return factory(iface, fallback, mosca);
}

function mqttFactory(iface, fallback, mosca) {
  return net.createServer(buildWrap(mosca));
}

function mqttsFactory(iface, fallback, mosca) {
  var credentials = iface.credentials || fallback.credentials;
  if (credentials === undefined) {
    throw new Error("missing credentials for mqtts server");
  }

  if (credentials.keyPath) {
    credentials.key = fs.readFileSync(credentials.keyPath);
  }

  if (credentials.certPath) {
    credentials.cert = fs.readFileSync(credentials.certPath);
  }

  if (credentials.caPaths) {
    credentials.ca = [];
    credentials.caPaths.forEach(function (caPath) {
    	credentials.ca.push(fs.readFileSync(caPath));
    });
  }

  return tls.createServer(credentials, buildWrap(mosca));
}
function httpFactory(iface, fallback, mosca) {
  var serve = buildServe(iface, mosca);
  var server = http.createServer(serve);

  server.on('listening', function () {
    mosca.attachHttpServer(server);
  });
  return server;
}

function httpsFactory(iface, fallback, mosca) {
  var credentials = iface.credentials || fallback.credentials;
  if (credentials === undefined) {
    throw new Error("missing credentials for https server");
  }

  if (credentials.keyPath) {
    credentials.key = fs.readFileSync(credentials.keyPath);
  }

  if (credentials.certPath) {
    credentials.cert = fs.readFileSync(credentials.certPath);
  }

  if (credentials.caPaths) {
    credentials.ca = [];
    credentials.caPaths.forEach(function (caPath) {
    	credentials.ca.push(fs.readFileSync(caPath));
    });
  }

  var serve = buildServe(iface, mosca);
  var server = https.createServer(credentials, serve);
  mosca.attachHttpServer(server);
  return server;
}


/**
 * Create the wrapper for mqtt server to disable Nagle algorithm.
 * 
 * @param  {Object}   iface Inrerface from `interfaces`
 * @return {Function}       Wrap function
 */
function buildWrap(mosca) {
  return function wrap(stream) {
    var connection = new Connection(stream);
    stream.setNoDelay(true);
    new Client(connection, mosca); // REFACTOR?
  };
}

/**
 * Create the serve logic for http server.
 * 
 * @param  {Object}   iface Inrerface from `interfaces`
 * @return {Function}       Serve function
 */
function buildServe(iface, mosca) {
  var mounts = [];
  var logger = mosca.logger.child({ service: 'http bundle' });

  if (iface.bundle) {
    mounts.push(st({
      path: __dirname + "/../public",
      url: "/",
      dot: true,
      index: false,
      passthrough: true
    }));
  }

  if (iface.static) {
    mounts.push(st({
      path: iface.static,
      dot: true,
      url: "/",
      index: "index.html",
      passthrough: true
    }));
  }

  return function serve(req, res) {

    logger.info({ req: req });

    var cmounts = [].concat(mounts);

    res.on('finish', function() {
      logger.info({ res: res });
    });

    function handle() {
      var mount = cmounts.shift();

      if (mount) {
        mount(req, res, handle);
      } else {
        res.statusCode = 404;
        res.end("Not Found\n");
      }
    }

    handle();
  };
}
