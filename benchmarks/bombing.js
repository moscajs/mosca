var mqtt = require('mqtt');
var client = mqtt.createClient(1883, "localhost", { clean: true });

function publish() {
  client.publish("test", "payload");
  setImmediate(publish);
}

client.on("connect", publish);
