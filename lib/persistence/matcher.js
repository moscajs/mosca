var Qlobber = require("qlobber").Qlobber;
var util = require("util");

function Matcher() {
  Qlobber.call(this, { separator: "/", wildcard_one: "+" });
}

util.inherits(Matcher, Qlobber);

module.exports = Matcher;
