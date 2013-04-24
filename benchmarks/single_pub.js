#! /usr/bin/env node

var mosca = require("../");
var async = require("async");
var runner = require("async_bench");
var program = require("commander");
var mqtt = require("mqtt");

function setup(done) {

  var client = mqtt.createClient(1883, "localhost", { clean: true });

  client.on("connect", function () { 
    done(null, client);
  });
}

function teardown(client, callback) {
  client.end();
  process.nextTick(callback);
}

function bench(pubs, client, done) {
  client.publish("hello", "world", { qos: program.qos } , function () {
    if(pubs === 0) {
      done(null, client);
    } else {
      bench(--pubs, client, done);
    }
  });
}

program
  .option("--header", "add header")
  .option("-r, --runs <n>", "the number of runs to execute", parseInt, 10)
  .option("-q, --qos <n>", "the QoS level (0, 1, 2)", parseInt, 0)
  .option("-p, --pubs <n>", "the number of publish to do", parseInt, 1)
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
  bench: async.apply(bench, program.pubs),
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
