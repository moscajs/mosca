var mqtt = require('mqtt');

var client = mqtt.createClient(1883);
var counter = 0;

function count() {
  console.log(counter);
  counter = 0;
  setTimeout(count, 1000);
}

client.on('connect', function() {
  count();
  this.subscribe('test');
  this.on("message", function() {
    counter++;
  });
});
