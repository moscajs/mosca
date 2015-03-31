"use strict";

var Mongo = require("../../").persistence.Mongo;
var MongoClient = require('mongodb').MongoClient;
var clean = require("mongo-clean");

var util = require("util");
var EventEmitter = require("events").EventEmitter;

var emptyServer = function() {
};
util.inherits(emptyServer, EventEmitter);

describe("mosca.persistence.store_qos0_messages", function() {
  
  var opts = {
    url : "mongodb://localhost:27017/moscatests",
    autoClose : false,
    ttl : {
      subscriptions : 1000,
      packets : 1000
    },
    store_qos0_messages : false
  };
  
  before(function(done) {
    // Connect to the db
    MongoClient.connect(opts.url, {
      safe : true
    }, function(err, db) {
      opts.connection = db;
      done(err);
    });
  });
  
  beforeEach(function(done) {
    clean(opts.connection, done);
  });
  
  afterEach(function() {
    
  });
  
  describe("store_qos0_messages = false", function() {
    
    it("qos 0, retain false", function(done) {
      
      opts.store_qos0_messages = false;
      
      var server = new emptyServer();
      
      var instance = new Mongo(opts);
      instance.wire(server);
      
      var client = {
        id : "my client id - 42",
        clean : false,
        subscriptions : {
          "hello/#" : {
            qos : 1
          }
        },
        logger : {
          debug : function() {
          }
        }
      };
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : false,
        payload : new Buffer("world"),
        messageId : 42
      };
      
      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance._packets.find().count(function(err, total) {
            expect(total).to.eql(0);
            done();
          });
        });
      });
    });
    
    it("qos 0, retain true", function(done) {
      
      opts.store_qos0_messages = false;
      
      var server = new emptyServer();
      
      var instance = new Mongo(opts);
      instance.wire(server);
      
      var client = {
        id : "my client id - 42",
        clean : false,
        subscriptions : {
          "hello/#" : {
            qos : 1
          }
        },
        logger : {
          debug : function() {
          }
        }
      };
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : true,
        payload : new Buffer("world"),
        messageId : 42
      };
      
      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance._packets.find().count(function(err, total) {
            expect(total).to.eql(1);
            done();
          });
        });
      });
    });
    
  });
  
  describe("store_qos0_messages = true", function() {
    
    it("qos 0, retain false", function(done) {
      
      opts.store_qos0_messages = true;
      
      var server = new emptyServer();
      
      var instance = new Mongo(opts);
      instance.wire(server);
      
      var client = {
        id : "my client id - 42",
        clean : false,
        subscriptions : {
          "hello/#" : {
            qos : 1
          }
        },
        logger : {
          debug : function() {
          }
        }
      };
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : false,
        payload : new Buffer("world"),
        messageId : 42
      };
      
      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance._packets.find().count(function(err, total) {
            expect(total).to.eql(1);
            done();
          });
        });
      });
      
    });
    
    it("qos 0, retain true", function(done) {
      
      opts.store_qos0_messages = true;
      
      var server = new emptyServer();
      
      var instance = new Mongo(opts);
      instance.wire(server);
      
      var client = {
        id : "my client id - 42",
        clean : false,
        subscriptions : {
          "hello/#" : {
            qos : 1
          }
        },
        logger : {
          debug : function() {
          }
        }
      };
      
      var packet = {
        topic : "hello/42",
        qos : 0,
        retain : true,
        payload : new Buffer("world"),
        messageId : 42
      };
      
      server.persistClient(client, function() {
        server.storePacket(packet, function() {
          instance._packets.find().count(function(err, total) {
            expect(total).to.eql(1);
            done();
          });
        });
      });
      
    });
  });
  
});

