//var mosca = require('mosca');
var persistence = require("./persistence");
var Server = require("./server");
var crypto = require('crypto');
var fs = require('fs');

var backend = {
    type: "kafka",
    json: false,
    connectionString: "kafka01:2181,kafka02:2181:kafka03:2181",
    clientId: "mosca",
    groupId: "mosca",
    defaultEncoding: "utf8",
    encodings:{
          "spiddal-adcp": "buffer"
    }
  };

//var SECURE_KEY = __dirname + '/../../test/secure/tls-key.pem';
//var SECURE_CERT = __dirname + '/../../test/secure/tls-cert.pem';

var moscaSettings = {
    interfaces: [
        { type: "mqtt", port: 1883 },
        { type: "http", port: 80, bundle: true, static: "./public" }
/*
        { type: "mqtts", port: 8883, credentials: { keyPath: SECURE_KEY, certPath: SECURE_CERT } },
        { type: "https", port: 3001, bundle: true, credentials: { keyPath: SECURE_KEY, certPath: SECURE_CERT } }
*/
    ],
    id: "mosca",

     /*
     * avoid publishing to $SYS topics because
     * it violates kafka topic naming convention
     */
    stats: false,
    publishNewClient: false,
    publishClientDisconnect: false,
    publishSubscriptions: false,

    logger: { name: 'MoscaServer', level: 'debug' },

    persistence: { factory: persistence.LevelUp, path: "/app/db" },

    backend: backend,
};

/*
 * default authorization, if no auth.json file is present.
 */
var auth = {
  "*":{ // this asterisk requires no username. Remove it only allowing authorized users.
    password:"",
    subscribe: [ 
              "a_public_topic", "another_public_topic"
            ],
    publish: []
   }
};

/*
 * Read the auth.json file.
 * TODO: auto reload the file when it changes,
 * but maybe some complexities due to users already connected
 * if permissions were to change.
 */
fs.readFile('auth.json', 'utf8', function (err, data) {
    if (!err){
       auth = JSON.parse(data);
    }
});

/*
 * user is authenticated against the auth.json file, which
 * contains signature of password salted with username.
 */
var authenticate = function (client, username, password, callback) {
    var authorized = false;
    if(username === undefined && auth["*"] !== undefined){
       authorized = true;
    }else if(username !== undefined && password !== undefined){
       var pw = 
          crypto.createHash('md5').update(username).update(password.toString()).digest("hex");
       if(auth[username] !== undefined && auth[username].password == pw){
           client.user = username;
           authorized = true;
       }
    }
    callback(null,authorized);
}
/*
 * publish and subscribe permissions defined in auth.json
 */
var authorizeSubscribe = function (client, topic, callback) {
    var answer = false;
    if(auth["*"] !== undefined && auth["*"].subscribe.indexOf(topic)>=0){
       answer = true;
    }else if(client.user !== undefined && auth[client.user].subscribe.indexOf(topic)>=0){
          answer = true;
    }
    callback(null, answer);
}

var authorizePublish = function (client, topic, callback) {
    var answer = false;
    if(auth["*"] !== undefined && auth["*"].publish.indexOf(topic)>=0){
       answer = true;
    }else if(client.user !== undefined && auth[client.user].publish.indexOf(topic)>=0){
          answer = true;
    }
    callback(null, answer);
}

var server = new Server(moscaSettings);

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
    console.log("Subscribed :=", topic);
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
