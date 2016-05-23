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

var pino = require("pino");
var extend = require("extend");
var clone = require("clone");
var jsonschema = require("jsonschema");
var serializers = require("./serializers");

module.exports = {
  modernize: modernize,
  validate: validate,
  populate: populate,

  defaultsModern: defaultsModern,
  defaultsLegacy: defaultsLegacy,
};


/**
 * Modernize options.
 * This function does not populate missing fields with defaults.
 *
 * @api private
 * @param  {Object} options Legacy options
 * @return {Object}         Modernized options
 */
function modernize(legacy) {

  legacy = legacy || {};

  var modernized = {};

  // "plain copyable" conserved options
  var conserved = [
    "id",
    "host",
    "maxInflightMessages",
    "stats",
    "publishNewClient",
    "publishClientDisconnect",
    "publishSubscriptions"
  ];

  // copy all conserved options
  conserved.forEach(function (name) {
    if (legacy.hasOwnProperty(name)) {
      modernized[name] = legacy[name];
    }
  });

  // TODO: copy `backend` carefully
  if (legacy.hasOwnProperty('backend')) {
    modernized.backend = legacy.backend;
  }

  // TODO: copy `ascoltatore` carefully
  if (legacy.hasOwnProperty('ascoltatore')) {
    modernized.ascoltatore = legacy.ascoltatore;
  }

  // TODO: copy `persistence` carefully
  if (legacy.hasOwnProperty('persistence')) {
    modernized.persistence = legacy.persistence;
  }

  // TODO: copy `logger` carefully
  if (legacy.hasOwnProperty('logger')) {
    modernized.logger = legacy.logger;
  }

  // construct `credentials`
  if (legacy.hasOwnProperty('credentials')) {
    // copy as is
    modernized.credentials = clone(legacy.credentials);
  } else if (legacy.hasOwnProperty('secure')) {
    // construct from `secure`
    modernized.credentials = {};
    if (legacy.secure.hasOwnProperty('keyPath')) {
      modernized.credentials.keyPath = legacy.secure.keyPath;
    }
    if (legacy.secure.hasOwnProperty('certPath')) {
      modernized.credentials.certPath = legacy.secure.certPath;
    }
  } // else no credentials were provided

  // construct `interfaces`
  if (legacy.hasOwnProperty('interfaces')) {
    // cloning
    modernized.interfaces = clone(legacy.interfaces);
  } else {
    // construct from legacy keys
    modernized.interfaces = [];

    // translate mqtt options
    var mqtt_enabled = !legacy.onlyHttp && (typeof legacy.secure === 'undefined' || legacy.allowNonSecure);
    if (mqtt_enabled) {
      var mqtt_interface = { type: 'mqtt' };

      if (legacy.hasOwnProperty('port')) {
        mqtt_interface.port = legacy.port;
      }

      if (legacy.hasOwnProperty('maxConnections')) {
        mqtt_interface.maxConnections = legacy.maxConnections;
      }

      modernized.interfaces.push(mqtt_interface);
    }

    // translate mqtts options
    var mqtts_enabled = !legacy.onlyHttp && legacy.secure;
    if (mqtts_enabled) {
      var mqtts_interface = { type: 'mqtts' };

      if (legacy.secure.hasOwnProperty('port')) {
        mqtts_interface.port = legacy.secure.port;
      }

      modernized.interfaces.push(mqtts_interface);
    }

    // translate http options
    var http_enabled = !!(legacy.http);
    if (http_enabled) {
      var http_interface = { type: 'http' };

      if (legacy.http.hasOwnProperty('port')) {
        http_interface.port = legacy.http.port;
      }

      if (legacy.http.hasOwnProperty('bundle')) {
        http_interface.bundle = legacy.http.bundle;
      }

      if (legacy.http.hasOwnProperty('static')) {
        http_interface.static = legacy.http.static;
      }

      modernized.interfaces.push(http_interface);
    }

    // translate https options
    var https_enabled = !!(legacy.https);
    if (https_enabled) {
      var https_interface = { type: 'https' };

      if (legacy.https.hasOwnProperty('port')) {
        https_interface.port = legacy.https.port;
      }

      if (legacy.https.hasOwnProperty('bundle')) {
        https_interface.bundle = legacy.https.bundle;
      }

      if (legacy.https.hasOwnProperty('static')) {
        https_interface.static = legacy.https.static;
      }

      modernized.interfaces.push(https_interface);
    }

    // NOTE: there are ways end up with no interfaces at all, for example
    // `httpOnly: true` with undefined http and https
  }

  return modernized;
}


/**
 * Validate modern options.
 *
 * @api private
 * @param  {Object} options             Modern options
 * @return {jsonschema.ValidatorResult} Result of validation
 */
function validate(opts, validationOptions) {
  var validator = new jsonschema.Validator();

  // custom function type
  validator.types.function = function testFunction(instance) {
    return instance instanceof Function;
  };

  validator.addSchema({
    id: '/Credentials',
    type: 'object',
    additionalProperties: true,
    properties: {
      'keyPath': { type: 'string', required: true },
      'certPath': { type: 'string', required: true },
      'caPaths': { type: 'array', required: false },
      'requestCert': { type: 'boolean', required: false },
      'rejectUnauthorized': { type: 'boolean', required: false }
    }
  });

  validator.addSchema({
    id: '/Interface',
    type: 'object',
    properties: {
      'type': { type: ['string', 'function'], required: true },
      'host': { type: ['string', 'null'] },
      'port': { type: ['integer'] },
      'credentials': { $ref: '/Credentials' },
    }
  });

  validator.addSchema({
    id: '/Options',
    type: 'object',
    additionalProperties: false,
    properties: {
      'id': { type: 'string' },
      'host': { type: ['string', 'null'] },
      'interfaces': {
        type: 'array',
        items: { $ref: '/Interface' }
      },
      'credentials': { $ref: '/Credentials' },

      'backend': { type: 'object' },     // TODO
      'ascoltatore': { type: 'object' }, // TODO
      'persistence': { type: 'object' }, // TODO
      'logger': { type: 'object' },      // TODO

      'maxInflightMessages': { type: 'integer' },
      'stats': { type: 'boolean' },
      'publishNewClient': { type: 'boolean' },
      'publishClientDisconnect': { type: 'boolean' },
      'publishSubscriptions': { type: 'boolean' }
    }
  });

  var result = validator.validate(opts, '/Options', validationOptions);

  // check empty interfaces
  if (opts.hasOwnProperty('interfaces')) {
    if (opts.interfaces.length === 0) {
      result.addError('no interfaces were defined');
    }
  }

  // check required credentials
  if (opts.hasOwnProperty('interfaces')) {
    var hasCredentials = opts.hasOwnProperty('credentials');
    var reqCredentials = opts.interfaces.some(function (iface) {
      var req = (iface.type === 'mqtts' || iface.type === 'https');
      var has = iface.hasOwnProperty('credentials');
      return req && !has;
    });

    if (reqCredentials && !hasCredentials) {
      result.addError('one of the defiend interfaces requires credentials');
    }
  }

  // TODO: check conflicting backend and ascoltatore

  return result;
}


/**
 * Populate missing fields in modern options.
 *
 * @api private
 * @param  {Object} options Modern options
 * @return {Object}         Populated options
 */
function populate(opts) {
  var defaults = defaultsModern();

  // do not extend `interfaces`
  if (opts.hasOwnProperty('interfaces')) {
    delete defaults.interfaces;
  }
  var populated = extend(true, defaults, opts);

  populated.interfaces.forEach(function (iface) {
    if (typeof iface.port === "undefined") {
      switch (iface.type) {
        case "mqtt":   iface.port = 1883; break;
        case "mqtts":  iface.port = 8883; break;
        case "http":   iface.port = 3000; break;
        case "https":  iface.port = 3001; break;
      }
    }
  });

  return populated;
}


/**
 * Construct legacy default options.
 *
 * @api private
 * @return {Object}  Legacy options
 */
function defaultsLegacy() {
  return {
    port: 1883,
    host: null,
    maxConnections: 10000000,
    backend: {
      json: false,
      wildcardOne: '+',
      wildcardSome: '#'
    },
    stats: false,
    publishNewClient: true,
    publishClientDisconnect: true,
    publishSubscriptions: true,
    maxInflightMessages: 1024,
    logger: {
      name: "mosca",
      level: "warn",
      serializers: {
        client: serializers.clientSerializer,
        packet: serializers.packetSerializer,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
      }
    }
  };
}


/**
 * Construct modern default options.
 *
 * @api private
 * @return {Object}  Modern options
 */
function defaultsModern() {
  return {
    host: null,
    interfaces: [
      { type: "mqtt", port: 1883, maxConnections: 10000000 }
    ],
    backend: {
      json: false,
      wildcardOne: '+',
      wildcardSome: '#'
    },
    stats: false,
    publishNewClient: true,
    publishClientDisconnect: true,
    publishSubscriptions: true,
    maxInflightMessages: 1024,
    logger: {
      name: "mosca",
      level: "warn",
      serializers: {
        client: serializers.clientSerializer,
        packet: serializers.packetSerializer,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
      }
    }
  };
}
