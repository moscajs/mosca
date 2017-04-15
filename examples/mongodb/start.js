'use strict'

var mosca = require('../../');
var config = require('./config');

var server = new mosca.Server(config);

server.on('error', function(err){
  console.log(err);
});

server.on('ready', function(){
  console.log('Mosca server is up and running');
});
