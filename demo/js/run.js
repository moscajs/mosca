
function runCurrentScript(withOpts) {

  var script = $(".bespoke-active .highlight").text();

  script = script.replace("require(\"mqtt\")", "require(\"mqtt.js-over-websockets\")");
  if (withOpts) {
    script = script.replace("createClient(", "createClient(\"ws://localhost:3000\", ");
  } else {
    script = script.replace("createClient()", "createClient(\"ws://localhost:3000\")");
  }

  console.log(script);

  eval(script);
}
