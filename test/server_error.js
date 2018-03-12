var steed = require("steed");

var moscaSettings = function() {
    return {
        port: 1883
    };
};

describe("mosca.Server.error", function() {
    var instance;
    var secondInstance;
    var settings;

    beforeEach(function(done) {
        settings = moscaSettings();
        settings.publishNewClient = false;
        settings.publishClientDisconnect = false;
        instance = new mosca.Server(settings, done);
        this.instance = instance;
        this.settings = settings;
        secondInstance = null;

    });

    afterEach(function(done) {
        var instances = [this.instance];

        if (secondInstance) {
            instances.push(secondInstance);
        }

        steed.each(instances, function(instance, cb) {
            instance.close(cb);
        }, function() {
            setImmediate(done);
        });
    });
    it("should get Error: listen EADDRINUSE :::1883", function(done) {
        secondInstance = new mosca.Server(moscaSettings(), function(err, server) {
            expect(server === secondInstance).to.be.true;
        });
        secondInstance.on('error', function(err) {
            expect(err.toString()).to.be.equal("Error: listen EADDRINUSE :::1883");
            done();
        });
    });
});