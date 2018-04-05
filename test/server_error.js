var steed = require('steed');
var assert = chai.assert;

var moscaSettings = function () {
  return {
    port: 1883,
    http: {
      port: 8000
    }
  };
};

var moscaSettings2 = function () {
  return {
    port: 1884,
    http: {
      port: 8000
    }
  };
};


describe('mosca.Server.error', function () {
  var instance;
  var secondInstance;

  beforeEach(function (done) {
    instance = null;
    secondInstance = null;
    done();
  });

  afterEach(function (done) {
    this.instance = instance;
    var instances = [this.instance];

    if (secondInstance) {
      instances.push(secondInstance);
    }

    steed.each(instances, function (instance, cb) {
      instance.close(cb);
    }, function () {
      setImmediate(done);
    });
  });
  it('should get MQTT port Error: listen EADDRINUSE', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of two seconds
    instance = new mosca.Server(moscaSettings(), function (err, server) {
      assert.ifError(err);
      expect(server === instance).to.be.true;
    });
    secondInstance = new mosca.Server(moscaSettings(), function (err, server) {
      assert.ifError(err);
      expect(server === secondInstance).to.be.true;
    });
    secondInstance.on('error', function (err) {
      expect(err.toString().substr(0, 24)).to.be.equal('Error: listen EADDRINUSE');
      done();
    });
  });
  it('should get HTTP port Error: listen EADDRINUSE', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of two seconds
    instance = new mosca.Server(moscaSettings(), function (err, server) {
      assert.ifError(err);
      expect(server === instance).to.be.true;
    });
    secondInstance = new mosca.Server(moscaSettings2(), function (err, server) {
      assert.ifError(err);
      expect(server === secondInstance).to.be.true;
    });
    secondInstance.on('error', function (err) {
      expect(err.toString().substr(0, 24)).to.be.equal('Error: listen EADDRINUSE');
      done();
    });
  });
});