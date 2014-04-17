
function runCurrentScript(withOpts) {

  var script = $(".bespoke-active .highlight").text();

  script = script.replace("var mqtt = require(\"mqtt\");", "");
  if (withOpts) {
    script = script.replace("createClient(", "createClient(3000,\"ws://localhost:3000\", ");
  } else {
    script = script.replace("createClient()", "createClient(3000,\"ws://localhost:3000\")");
  }
  eval(script);

}
