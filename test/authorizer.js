"use strict";

var hasher = require("pbkdf2-password")();
var steed = require("steed");

describe("mosca.Authorizer", function() {

  var authorizer, instance, client;

  beforeEach(function() {
    authorizer = new mosca.Authorizer();
    client = {};
  });

  describe("authenticate", function() {

    beforeEach(function() {
      instance = authorizer.authenticate;
    });

    it("it should not authenticate an unknown user", function(done) {
      instance(client, "user", "pass", function(err, success) {
        expect(success).to.be.false;
        done();
      });
    });

    it("it should authenticate a known user", function(done) {
      authorizer.addUser("user", "pass", function() {
        instance(client, "user", "pass", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authenticate a user with the wrong password", function(done) {

      authorizer.addUser("user", "pass", function() {
        instance(client, "user", "wrongpass", function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should not authenticate a user without a password", function(done) {

      authorizer.addUser("user", "pass", function() {
        instance(client, "user", null, function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should not authenticate a user without a username", function(done) {

      authorizer.addUser("user", "pass", function() {
        instance(client, null, "pass", function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should authenticate a user known user", function(done) {

      authorizer.addUser("matteo", "collina", function() {
        instance(client, "matteo", "collina", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authenticate a removed user", function(done) {
      steed.waterfall([
        authorizer.addUser.bind(authorizer, "matteo", "collina"),
        authorizer.rmUser.bind(authorizer, "matteo"),
        instance.bind(null, client, "matteo", "collina")
      ], function(err, success) {
        expect(success).to.be.false;
        done();
      });
    });

    it("it should add the username to the client", function(done) {
      authorizer.addUser("user", "pass", function() {
        instance(client, "user", "pass", function(err, success) {
          expect(client).to.have.property("user", "user");
          done();
        });
      });
    });
  });

  describe("users", function() {

    beforeEach(function() {
      instance = authorizer;
    });

    it("should memorize a user", function(done) {
      instance.addUser("matteo", "collina", function() {
        expect(instance.users.matteo).to.exist;
        done();
      });
    });

    it("should memorize a user has salt/hash combination", function(done) {
      instance.addUser("matteo", "collina", function() {
        expect(instance.users.matteo.salt).to.exist;
        expect(instance.users.matteo.hash).to.exist;
        done();
      });
    });

    it("should be a real hash", function(done) {
      instance.addUser("matteo", "collina", function() {
        hasher({
          password: "collina",
          salt: instance.users.matteo.salt
        },

        function(err, pass, salt, hash) {
          expect(hash).to.eql(instance.users.matteo.hash);
          done();
        });
      });
    });
  });

  it("should support passing users as a parameter", function() {
    var users = {};
    instance = new mosca.Authorizer(users);
    expect(instance.users).to.equal(users);
  });

  describe("authorizePublish", function() {

    beforeEach(function(done) {
      client.user = "user";
      instance = authorizer.authorizePublish;
      authorizer.addUser("user", "pass", function() {
        done();
      });
    });

    it("it should authorize a publish based on the topic", function(done) {
      instance(client, "topic", "payload", function(err, success) {
        expect(success).to.be.true;
        done();
      });
    });

    it("it should authorize a publish based on a long topic", function(done) {
      instance(client, "/long/topic", "payload", function(err, success) {
        expect(success).to.be.true;
        done();
      });
    });

    it("it should not authorize a publish based on the topic", function(done) {
      authorizer.addUser("user", "pass", "/topic", function() {
        instance(client, "other", "payload", function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("should default the authorizePublish param to **", function(done) {
      authorizer.addUser("user", "pass", null, function() {
        instance(client, "other", "payload", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should authorize a publish based on a pattern", function(done) {
      authorizer.addUser("user", "pass", "/topic/*", function() {
        instance(client, "/topic/other", "payload", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authorize a publish based on a pattern", function(done) {
      authorizer.addUser("user", "pass", "/topic/*", function() {
        instance(client, "/topic/other/buu", "payload", function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should authorize a publish based on a unlimited pattern", function(done) {
      authorizer.addUser("user", "pass", "/topic/**", function() {
        instance(client, "/topic/other/buu", "payload", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should authorize a publish based on a recursive pattern", function(done) {
      authorizer.addUser("user", "pass", "/topic/**/buu", function() {
        instance(client, "/topic/other/long/buu", "payload", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });
  });

  describe("authorizeSubscribe", function() {

    beforeEach(function(done) {
      client.user = "user";
      instance = authorizer.authorizeSubscribe;
      authorizer.addUser("user", "pass", function() {
        done();
      });
    });

    it("it should authorize a subscribe based on the topic", function(done) {
      instance(client, "topic", function(err, success) {
        expect(success).to.be.true;
        done();
      });
    });

    it("it should authorize a publish based on a long topic", function(done) {
      instance(client, "/long/topic", function(err, success) {
        expect(success).to.be.true;
        done();
      });
    });

    it("should default the authorizeSubscribe param to **", function(done) {
      authorizer.addUser("user", "pass", null, null, function() {
        instance(client, "other", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authorize a publish based on the topic", function(done) {
      authorizer.addUser("user", "pass", "**", "/topic", function() {
        instance(client, "other", function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should authorize a publish based on a pattern", function(done) {
      authorizer.addUser("user", "pass", "**", "/topic/*", function() {
        instance(client, "/topic/other", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should not authorize a publish based on a pattern", function(done) {
      authorizer.addUser("user", "pass", "**", "/topic/*", function() {
        instance(client, "/topic/other/buu", function(err, success) {
          expect(success).to.be.false;
          done();
        });
      });
    });

    it("it should authorize a publish based on a unlimited pattern", function(done) {
      authorizer.addUser("user", "pass", "**", "/topic/**", function() {
        instance(client, "/topic/other/buu", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });

    it("it should authorize a publish based on a recursive pattern", function(done) {
      authorizer.addUser("user", "pass", "**", "/topic/**/buu", function() {
        instance(client, "/topic/other/long/buu", function(err, success) {
          expect(success).to.be.true;
          done();
        });
      });
    });
  });
});
