"use strict";

var abstract = require("./abstract");
var utilities = require("../../lib/persistence/utils");
var topicPatterns = utilities.topicPatterns;
var steed = require("steed");

describe("persistence utilities", function() {

  describe("topicPatterns", function() {

    it("should return the topic itself if it is not part of a tree", function() {
      expect(topicPatterns("hello")).to.eql(["hello"]);
    }); 

    it("should return all the possibilities for a 2-level topic", function() {
      var members = [
        "hello/world",
        "hello/#",
        "hello/+",
        "#/world",
        "+/world"
      ];
      var result = topicPatterns("hello/world");
      expect(result).to.include.members(members);
      expect(result).to.have.property("length", members.length);
    }); 

    it("should return all the possibilities for a 3-level topic", function() {
      var members = [
        "hello/world/42",
        "hello/#",
        "hello/+/+",
        "#/world/#",
        "+/world/+",
        "#/42",
        "+/+/42",
        "hello/#/42",
        "hello/+/42",
        "hello/world/#",
        "hello/world/+",
        "#/world/42",
        "+/world/42"
      ];
      var result = topicPatterns("hello/world/42");
      expect(result).to.include.members(members);
      expect(result).to.have.property("length", members.length);
    }); 

    it("should return all the possibilities for a 4-level topic", function() {
      var members = [
        'hello/matteo/and/david',
        'hello/#',
        'hello/+/+/+',
        '#/matteo/#',
        '+/matteo/+/+',
        '#/and/#',
        '+/+/and/+',
        '#/david',
        '+/+/+/david',
        'hello/#/david',
        'hello/+/+/david',
        'hello/matteo/#',
        'hello/matteo/+/+',
        '#/matteo/and/#',
        '+/matteo/and/+',
        '#/and/david',
        '+/+/and/david',
        'hello/#/and/david',
        'hello/+/and/david',
        'hello/matteo/#/david',
        'hello/matteo/+/david',
        'hello/matteo/and/#',
        'hello/matteo/and/+',
        '#/matteo/and/david',
        '+/matteo/and/david' 
        // FIXME generate the remaining ones
        //'+/matteo/+/david',
        //'#/matteo/#/david',
        //'hello/#/and/#',
        //'hello/+/and/+'
      ];
      var result = topicPatterns("hello/matteo/and/david");
      expect(result).to.eql(members);
    });
  }); 
});
