var mosca = require('mosca');

var pubsubSettings = {
    /* For AMQP */
    type: 'amqp',
    json: false,
    amqp: require('amqp'),
    exchange: 'amq.topic'
};

var SECURE_KEY = __dirname + '/../../test/secure/tls-key.pem';
var SECURE_CERT = __dirname + '/../../test/secure/tls-cert.pem';

var moscaSetting = {
    interfaces: [
        { type: "mqtt", port: 1883 },
        { type: "mqtts", port: 8883, credentials: { keyPath: SECURE_KEY, certPath: SECURE_CERT } },
        { type: "http", port: 3000, bundle: true },
        { type: "https", port: 3001, bundle: true, credentials: { keyPath: SECURE_KEY, certPath: SECURE_CERT } }
    ],
    stats: false,

    logger: { name: 'MoscaServer', level: 'debug' },

    persistence: { factory: mosca.persistence.Redis, url: 'localhost:6379', ttl: { subscriptions: 1000 * 60 * 10, packets: 1000 * 60 * 10 } },

    backend: pubsubSettings,
};

var authenticate = function (client, username, password, callback) {
    if (username == "test" && password.toString() == "test")
        callback(null, true);
    else
        callback(null, false);
}

var authorizePublish = function (client, topic, payload, callback) {
    callback(null, true);
}

var authorizeSubscribe = function (client, topic, callback) {
    callback(null, true);
}

var server = new mosca.Server(moscaSetting);

server.on('ready', setup);

function setup() {
    server.authenticate = authenticate;
    server.authorizePublish = authorizePublish;
    server.authorizeSubscribe = authorizeSubscribe;
    
    console.log('Mosca server is up and running.');
}

server.on("error", function (err) {
    console.log(err);
});

server.on('clientConnected', function (client) {
    console.log('Client Connected \t:= ', client.id);
});

server.on('published', function (packet, client) {
    console.log("Published :=", packet);
});

server.on('subscribed', function (topic, client) {
    console.log("Subscribed :=", client.packet);
});

server.on('unsubscribed', function (topic, client) {
    console.log('unsubscribed := ', topic);
});

server.on('clientDisconnecting', function (client) {
    console.log('clientDisconnecting := ', client.id);
});

server.on('clientDisconnected', function (client) {
    console.log('Client Disconnected     := ', client.id);
});
