
var pkg = require("../package");
var program = require("commander");

program
  .version(pkg.version)
  .option("-p, --port <n>", "the port to listen to", parseInt)
  .option("--parent-port <n>", "the parent port to connect to", parseInt)
  .option("--parent-host <s>", "the parent host to connect to")
  .option("--parent-prefix <s>", "the prefix to use in the parent broker")
  .option("-v, --verbose", "equal to DEBUG=mosca")
  .option("--very-verbose", "equal to DEBUG=mosca,ascoltatori:*");

/**
 * The basic command line interface of Mosca.
 *
 * @api private
 */
module.exports = function cli(argv) {

  argv = argv || [];

  program.parse(argv);

  if(program.veryVerbose) {
    process.env.DEBUG = "mosca,ascoltatori:*";
  } else if(program.verbose) {
    process.env.DEBUG = "mosca";
  }

  // this MUST be done after changing the DEBUG env
  var Server = require("./server");

  var opts = {
    backend: {}
  };
  opts.port = program.port;

  if (program.parentPort || program.parentHost) {
    opts.backend.type = "mqtt";
    opts.backend.port = 1883;
  }

  if (program.parentHost) {
    opts.backend.host = program.parentHost;
  }

  if (program.parentPort) {
    opts.backend.port = program.parentPort;
  }

  opts.backend.prefix = program.parentPrefix;

  return new Server(opts);
};
