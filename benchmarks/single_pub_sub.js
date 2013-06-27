#! /usr/bin/env node

var mosca = require("../");
var async = require("async");
var runner = require("async_bench");
var program = require("commander");
var mqtt = require("mqtt");

function setup(done) {

  var client = mqtt.createClient(1883, "localhost", { clean: program.clean });

  client.on("connect", function () { 
    client.subscribe("hello", { qos: program.qos }, function () {
      done(null, client);
    });
  });

  client.on("error", function (err) {
    console.log(err);
    if(err.errno == 'EADDRINUSE') {
      setTimeout(function () {
        setup(done);
      }, 1000);
    }
  });

  client.on("message", function (){
    client.pass(null, client);
  });
}

function teardown(client, callback) {
  client.on("close", callback);
  client.end();
}

function bench(client, done) {
  client.pass = done;
  client.publish("hello", "world");
}

program
  .option("--clean", "use clean clients")
  .option("--header", "add header")
  .option("-r, --runs <n>", "the number of runs to execute", parseInt, 10)
  .option("-q, --qos <n>", "the QoS level (0, 1, 2)", parseInt, 0)
  .option("-n, --no-stat", "print only the samples, no stats")
  .parse(process.argv);

function toCSV() {
  var array = Array.prototype.slice.apply(arguments);
  return array.reduce(function (acc, e) {
    return acc + ", " + e;
  });
}

runner({
  preHeat: program.runs,
  runs: program.runs,
  setup: setup,
  bench: bench,
  teardown: teardown,
  complete: function (err, results, samples) {
    if (err) {
      console.log(err);
      return;
    } else if(program.stat) {
      if(program.header) {
        console.log(toCSV("mean", "standard deviation", "median", "mode", "runs"));
      }
      console.log(toCSV(results.mean, results.stdDev, results.median, results.mode, program.runs));
    } else {
      console.log("sample");
      samples.forEach(function(e) {
        console.log(e);
      });
    }
    setTimeout(function() {
      process.exit(0);
    }, 100);
  }
});
