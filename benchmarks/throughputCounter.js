var mqtt = require('mqtt');

var client = mqtt.createClient(1883);
var counter = 0;
var interval = 5000;

function count() {
  console.log("msg/s", counter / interval * 1000);
  counter = 0;
  setTimeout(count, interval);
}

client.on('connect', function() {
  count();
  this.subscribe('test');
  this.on("message", function() {
    counter++;
  });
});
