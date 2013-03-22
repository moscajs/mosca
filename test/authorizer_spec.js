"use strict";

var hasher = require("../lib/hasher");
var async = require("async");

describe("mosca.Authorizer", function () {

  var authorizer, instance, client;

  beforeEach(function () {
    authorizer = new mosca.Authorizer();
    client = {};
  });

  describe("authenticate", function () {

    beforeEach(function () {
      instance = authorizer.authenticate;
    });

    it("it should not authenticate an unknown user", function (done) {
      instance(client, "user", "pass", function (err, success) {
        expect(success).to.be.false;
        done();
      });
    });

    it("it should authenticate a known user", function (done) {
      authorizer.addUser("user", "pass", function () {
        instance(client, "user", "pass", function (err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authenticate a user with the wrong password", function (done) {

      authorizer.addUser("user", "pass", function () {
        instance(client, "user", "wrongpass", function (err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should authenticate a user known user", function (done) {

      authorizer.addUser("matteo", "collina", function () {
        instance(client, "matteo", "collina", function (err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authenticate a removed user", function (done) {
      async.waterfall([
        authorizer.addUser.bind(authorizer, "matteo", "collina"),
        authorizer.rmUser.bind(authorizer, "matteo"),
        instance.bind(null, client, "matteo", "collina")
      ], function (err, success) {
        expect(success).to.be.false;
        done();
      });
    });
  });

  describe("users", function () {
    
    beforeEach(function () {
      instance = authorizer;
    });

    it("should memorize a user", function (done) {
      instance.addUser("matteo", "collina", function () {
        expect(instance.users.matteo).to.exist;
        done();
      });
    });

    it("should memorize a user has salt/hash combination", function (done) {
      instance.addUser("matteo", "collina", function () {
        expect(instance.users.matteo.salt).to.exist;
        expect(instance.users.matteo.hash).to.exist;
        done();
      });
    });

    it("should be a real hash", function (done) {
      instance.addUser("matteo", "collina", function () {
        hasher({ password: "collina", salt: instance.users.matteo.salt },
               function (err, pass, salt, hash) {
          expect(hash).to.eql(instance.users.matteo.hash);
          done();
        });
      });
    });
  });

  it("should support passing users as a parameter", function () {
    var users = {};
    instance = new mosca.Authorizer(users);
    expect(instance.users).to.equal(users);
  });
});
