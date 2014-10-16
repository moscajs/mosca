"use strict";

var fs = require("fs");
var mqtt = require("mqtt");
var mows = require("mows");
var http = require("http");
var https = require("https");
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
  var wrap = buildWrap(mosca);
  var server = mqtt.createServer(wrap);
  return server;
}

function mqttsFactory(iface, fallback, mosca) {
  var credentials = iface.credentials || fallback.credentials;
  if (credentials === undefined) {
    throw new Error("missing credentials for mqtts server");
  }

  var wrap = buildWrap(mosca);
  var server = mqtt.createSecureServer(credentials.keyPath, credentials.certPath, wrap);
  return server;
}

function httpFactory(iface, fallback, mosca) {
  var serve = buildServe(iface, mosca);
  var server = http.createServer(serve);

  mosca.attachHttpServer(server); // REFACTOR?
  return server;
}

function httpsFactory(iface, fallback, mosca) {
  var credentials = iface.credentials || fallback.credentials;
  if (credentials === undefined) {
    throw new Error("missing credentials for https server");
  }

  var serve = buildServe(iface, mosca);
  var server = https.createServer({
    key: fs.readFileSync(credentials.keyPath),
    cert: fs.readFileSync(credentials.certPath),
  }, serve);

  mosca.attachHttpServer(server); // REFACTOR?
  return server;
}


/**
 * Create the wrapper for mqtt server to disable Nagle algorithm.
 * 
 * @param  {Object}   iface Inrerface from `interfaces`
 * @return {Function}       Wrap function
 */
function buildWrap(mosca) {
  return function wrap(connection) {
    connection.stream.setNoDelay(true);
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
