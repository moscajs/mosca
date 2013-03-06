#! /usr/bin/env node

var mosca = require("../");
var async = require("async");
var runner = require("async_bench");
var program = require("commander");
var mqtt = require("mqtt");

function setup(done) {

  var client = mqtt.createClient();

  client.on("connect", function () { 
    done(null, client);
  });
}

function teardown(client, callback) {
  client.end();
  process.nextTick(callback);
}

function bench(client, done) {
  client.publish("hello", "world", { qos: program.qos } , function () {
    done(null, client);
  });
}

program
  .option("--header", "add header")
  .option("-r, --runs <n>", "the number of runs to execute", parseInt, 10)
  .option("-q, --qos <n>", "the QoS level (0, 1, 2)", parseInt, 0)
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
  complete: function (err, results) {
    if (err) {
      console.log(err);
      process.exit(0);
      return;
    }

    if(program.header) {
      console.log(toCSV("mean", "standard deviation", "median", "mode", "runs"));
    }
    console.log(toCSV(results.mean, results.stdDev, results.median, results.mode, program.runs));
    setTimeout(function() {
      process.exit(0);
    }, 10);
  }
});
