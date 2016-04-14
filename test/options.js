var options = require("../lib/options");

var legacyKeys = [
  "port",
  "secure",
  "http",
  "https",
  "allowNonSecure",
  "onlyHttp"
];

var deeplegacy = {
  port: 1883,
  host: null,
  secure: {
    port: 8883,
    keyPath: "path/to/key",
    certPath: "path/to/cert"
  },
  http: {
    port: 3000,
    bundle: true,
    static: "path/to/static"
  },
  https: {
    port: 3001,
    bundle: true,
    static: "path/to/static"
  },
  allowNonSecure: false,
  onlyHttp: false
};

describe("mocha.options", function () {
  
  describe("modern defaults", function () {

    it("should not contain legacy keys", function () {
      var modern = options.defaultsModern();

      legacyKeys.forEach(function (key) {
        expect(modern).to.not.have.property(key);
      });
    });

    it("should contain fallback host", function () {
      var modern = options.defaultsModern();

      expect(modern).to.have.property("host");
      expect(modern.host).to.be.equal(null);
    });

    it("should contain single mqtt interface", function () {
      var modern = options.defaultsModern();

      expect(modern).to.have.property("interfaces");
      expect(modern.interfaces).to.be.deep.equal(
        [
          { type: "mqtt", port: 1883, maxConnections: 10000000 }
        ]
      );
    });

    it("should not contain credentials", function () {
      var modern = options.defaultsModern();
      expect(modern).to.not.have.property("credentials");
    });

  });

  describe("modernize", function () {
    
    it("should not try to change passed options", function () {
      var legacy = options.defaultsLegacy(); // necessary
      Object.freeze(legacy);

      var fn = function () { var modern = options.modernize(legacy); };
      expect(fn).to.not.throw(TypeError);
    });

    it("should correctly modernize legacy defaults", function () {
      var legacy = options.defaultsLegacy();
      var modern = options.defaultsModern();
      var modernized = options.modernize(legacy);

      expect(modernized).to.be.deep.equal(modern);
    });

    it("should change {} into a signle mqtt interface", function () {
      var legacy = {};
      var modernized = options.modernize(legacy);

      expect(modernized).to.be.deep.equal({
        interfaces: [
          { type: 'mqtt' },
        ]
      });
    });

    it("should not change modern defaults", function () {
      var modern = options.defaultsModern();
      var modernized = options.modernize(modern);

      expect(modernized).to.be.deep.equal(modern);
    });

    it("should remove legacy parameters", function () {
      var modernized = options.modernize(deeplegacy);

      legacyKeys.forEach(function (key) {
        expect(modernized).to.not.have.property(key);
      });
    });

    it("should not override or affect defined `interfaces`", function () {
      var legacy = {
        interfaces: []
      };

      var modernized = options.modernize(legacy);

      expect(modernized).to.have.property("interfaces");
      expect(modernized.interfaces).to.be.deep.equal([]);
    });

    it("should not override or affect defined `credentials`", function () {
      var legacy = {
        secure: {
          keyPath: "legacy/path",
          certPath: "legacy/path",
        },
        credentials: {
          keyPath: "modern/path",
          certPath: "modern/path",
        }
      };

      var modernized = options.modernize(legacy);

      expect(modernized).to.not.have.property("secure");
      expect(modernized).to.have.property("credentials");
      expect(modernized.credentials).to.be.deep.equal({
        keyPath: "modern/path",
        certPath: "modern/path",
      });
    });

    it("should not break custom interface type", function () {
      var factory = function () {}; // mock

      var legacy = {
        host: "localhost",
        interfaces: [
          { type: factory, port: 1234 },
        ]
      };

      var modernized = options.modernize(legacy);

      expect(modernized).to.have.property("interfaces");
      expect(modernized.interfaces).to.be.deep.equal([
        { type: factory, port: 1234 },
      ]);
    });

    it("should not override custom host, ports and credentials", function () {
      var credentials = {
        keyPath: "path/to/key",
        certPath: "path/to/cert",
      };

      var modern = {
        host: "localhost",
        interfaces: [
          { type: "mqtt", host: "::", port: 8080, credentials: credentials },
          { type: "mqtts", host: "[::]", port: 8081, credentials: credentials },
          { type: "http", host: "127.0.0.1", port: 8082, credentials: credentials },
          { type: "https", host: "0.0.0.0", port: 8083, credentials: credentials },
        ]
      };

      var populated = options.modernize(modern);

      expect(populated).to.have.property("interfaces");
      expect(populated.interfaces).to.be.deep.equal([
        { type: "mqtt", host: "::", port: 8080, credentials: credentials },
        { type: "mqtts", host: "[::]", port: 8081, credentials: credentials },
        { type: "http", host: "127.0.0.1", port: 8082, credentials: credentials },
        { type: "https", host: "0.0.0.0", port: 8083, credentials: credentials },
      ]);
    });

    describe("sample configurations", function () {

      it("should correctly modernize mqtt configuration", function () {
        var legacy = {
          port: 1883,
          host: "localhost"
        };
        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("port");
        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "mqtt", port: 1883 }, // port was specified
        ]);
      });

      it("should correctly modernize mqtts configuration", function () {
        var credentials = {
          keyPath: "path/to/key",
          certPath: "path/to/cert",
        };

        var legacy = {
          host: "127.0.0.1",
          secure: {
            port: 8883,
            keyPath: "path/to/key",
            certPath: "path/to/cert"
          }
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("127.0.0.1");

        expect(modernized).to.not.have.property("secure");
        expect(modernized).to.have.property("credentials");
        expect(modernized.credentials).to.be.deep.equal(credentials);

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "mqtts", port: 8883 }, // port was specified
        ]);
      });

      it("should correctly modernize mqtt+mqtts configuration", function () {
        var credentials = {
          keyPath: "path/to/key",
          certPath: "path/to/cert"
        };

        var legacy = {
          host: "localhost",
          secure: {
            port: 8883,
            keyPath: "path/to/key",
            certPath: "path/to/cert"
          },
          allowNonSecure: true
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("secure");
        expect(modernized).to.have.property("credentials");
        expect(modernized.credentials).to.be.deep.equal(credentials);

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "mqtt" }, // port was not specified
          { type: "mqtts", port: 8883 }, // port was specified
        ]);
      });

      it("should correctly modernize mqtt+http configuration", function () {
        var legacy = {
          host: "localhost",
          http: {
            port: 8000,
            bundle: true,
            static: "path/to/static",
          }
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("http");

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "mqtt" }, // port was not specified
          { type: "http", // port was specified
            port: 8000,
            bundle: true,
            static: "path/to/static" },
        ]);
      });

      it("should correctly modernize mqtts+https configuration", function () {
        var credentials = {
          keyPath: "path/to/key",
          certPath: "path/to/cert"
        };

        var legacy = {
          host: "localhost",
          secure: {
            port: 9000,
            keyPath: "path/to/key",
            certPath: "path/to/cert"
          },
          https: {
            port: 8001,
            bundle: true,
            static: "path/to/static"
          }
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("secure");
        expect(modernized).to.have.property("credentials");
        expect(modernized.credentials).to.be.deep.equal(credentials);

        expect(modernized).to.not.have.property("https");

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "mqtts", port: 9000 }, // port was specified
          { type: "https", // port was specified
            port: 8001,
            bundle: true,
            static: "path/to/static" },
        ]);
      });

      it("should correctly modernize http-only configuration", function () {
        var legacy = {
          host: "localhost",
          onlyHttp: true,
          http: {
            bundle: true,
            static: "path/to/static"
          }
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("http");
        expect(modernized).to.not.have.property("onlyHttp");

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "http", // port was not specified
            bundle: true,
            static: "path/to/static" },
        ]);
      });

      it("should correctly modernize https-only configuration", function () {
        var credentials = {
          keyPath: "path/to/key",
          certPath: "path/to/cert"
        };

        var legacy = {
          host: "localhost",
          onlyHttp: true, // secure is used only for credentials
          secure: {
            keyPath: "path/to/key",
            certPath: "path/to/cert"
          },
          https: {
            port: 8001,
            bundle: true,
            static: "path/to/static"
          }
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("https");
        expect(modernized).to.not.have.property("onlyHttp");

        expect(modernized).to.not.have.property("secure");
        expect(modernized).to.have.property("credentials");
        expect(modernized.credentials).to.be.deep.equal(credentials);

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "https", // port was specified
            port: 8001,
            bundle: true,
            static: "path/to/static" },
        ]);
      });

      it("should correctly modernize http+https configuration", function () {
        var credentials = {
          keyPath: "path/to/key",
          certPath: "path/to/cert"
        };

        var legacy = {
          host: "localhost",
          onlyHttp: true, // secure is used only for credentials
          secure: {
            keyPath: "path/to/key",
            certPath: "path/to/cert"
          },
          http: {
            port: 8000,
            bundle: true,
            static: "path/to/static"
          },
          https: {
            port: 8001,
            bundle: true,
            static: "path/to/static"
          }
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("localhost");

        expect(modernized).to.not.have.property("http");
        expect(modernized).to.not.have.property("https");
        expect(modernized).to.not.have.property("onlyHttp");

        expect(modernized).to.not.have.property("secure");
        expect(modernized).to.have.property("credentials");
        expect(modernized.credentials).to.be.deep.equal(credentials);

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "http", // port was specified
            port: 8000,
            bundle: true,
            static: "path/to/static" },
          { type: "https", // port was specified
            port: 8001,
            bundle: true,
            static: "path/to/static" }
        ]);
      });

      it("should correctly modernize complex configuration", function () {
        var credentials = {
          keyPath: "path/to/key",
          certPath: "path/to/cert"
        };

        var legacy = {
          port: 1883,
          host: "127.0.0.1",
          secure: {
            port: 8883,
            keyPath: "path/to/key",
            certPath: "path/to/cert"
          },
          http: {
            port: 3000,
            bundle: true,
            static: "path/to/static"
          },
          https: {
            port: 3001,
            bundle: true,
            static: "path/to/static"
          },
          onlyHttp: false,
          allowNonSecure: true
        };

        var modernized = options.modernize(legacy);
        var result = options.validate(modernized);
        expect(result.errors).to.be.deep.equal([]);

        expect(modernized).to.not.have.property("port");

        expect(modernized).to.have.property("host");
        expect(modernized.host).to.be.equal("127.0.0.1");

        expect(modernized).to.not.have.property("http");
        expect(modernized).to.not.have.property("https");
        expect(modernized).to.not.have.property("onlyHttp");
        expect(modernized).to.not.have.property("allowNonSecure");

        expect(modernized).to.not.have.property("secure");
        expect(modernized).to.have.property("credentials");
        expect(modernized.credentials).to.be.deep.equal(credentials);

        expect(modernized).to.have.property("interfaces");
        expect(modernized.interfaces).to.be.deep.equal([
          { type: "mqtt", port: 1883 }, // port was specified
          { type: "mqtts", port: 8883 }, // port was specified
          { type: "http", // port was specified
            port: 3000,
            bundle: true,
            static: "path/to/static" },
          { type: "https", // port was specified
            port: 3001,
            bundle: true,
            static: "path/to/static" }
        ]);
      });
    
    });

  });

  describe("populate", function () {

    it("should turn {} into modern defaults", function () {
      var modern = {};
      var populated = options.populate(modern);
      var defmodern = options.defaultsModern();
      expect(populated).to.be.deep.equal(defmodern);
    });

    it("should not change modern defaults", function () {
      var defmodern = options.defaultsModern();
      var populated = options.populate(defmodern);
      expect(populated).to.be.deep.equal(defmodern);
    });

    it("should populate default ports", function () {
      var modern = {
        interfaces: [
          { type: "mqtt" },
          { type: "mqtts" },
          { type: "http" },
          { type: "https" }
        ]
      };

      var populated = options.populate(modern);
      expect(populated.interfaces).to.be.deep.equal([
        { type: "mqtt", port: 1883 },
        { type: "mqtts", port: 8883 },
        { type: "http", port: 3000 },
        { type: "https", port: 3001 }
      ]);
    });

  });

  describe("validate", function () {

    it("should not complain to modern defaults", function () {
      var modern = options.defaultsModern();
      var result = options.validate(modern);

      expect(result.errors).to.be.deep.equal([]);
    });

    it("should not complain to modernized options", function () {
      var modernized = options.modernize(deeplegacy);
      var result = options.validate(modernized);

      expect(result.errors).to.be.deep.equal([]);
    });

  });

});
