#! /usr/bin/env node

require("../lib/cli")(process.argv, function(err) {
  console.log(err);
  process.exit(1);
});
