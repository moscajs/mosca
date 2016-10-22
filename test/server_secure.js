/* jshint multistr: true */

var abstractServerTests = require("./abstract_server");
var createConnection = require("./helpers/createConnection");

var SECURE_KEY = __dirname + "/secure/tls-key.pem";
var SECURE_KEY_TEXT = '-----BEGIN RSA PRIVATE KEY-----\n\
MIICWwIBAAKBgQCeStPaKQQ7L41rZBUJJpli5x6qEGnQuOM44kjtNdis9EsD2Q3u\n\
sprkj5NOaehM6dpJAtdfLQL1x4mJnP1BCINfQGjPIRKPZiHVEI6H0eQ0YhAj9ucK\n\
SYz7+M4btPTHTJkzXo0gaXSEXZKU1eE3USmnRuSufoXAVPMX1kNlb0q4fQIDAQAB\n\
AoGAd2TJVowJfPrpGE9s7nIGz+qz3mJy7dQGzykfCIzM2eeJjWVydNCStEL3QPXx\n\
GdJpqxhRiqBQ00GmI/4dp6fcLhRmGvPDRBDaMgz09fqX7Tx+nWwHeGw61/OrYVZ7\n\
aPKkaVB/moiB4EqWZs+knIYsOXQCixte/8ix//zlH2p3RgECQQDRYntnleyzARlb\n\
zxKEnB9GKwpLQYIijlMVIWB9+k3ZI+zlB58s0PP2xkLGZtmIhRgMDoeje0YZOcER\n\
AgjnQGyxAkEAwYhsM01dMv3qnCSoeJZjJDPZmuIfMHco6vMDYJd1Rs89/1Z3IJFJ\n\
/N3hQUKJpPeWpQtFPC9VnDTsTKpoQidLjQJAJeHMc9xDG8u6G8smDYn1eot07FKo\n\
ybm4PF1yiLhNd1ixlmo/mSsgyGfsUtruxm1WAXBrh99Yul2hmYMluzkDsQJACCpG\n\
Tl/MN9OIq2/Mf9Hwet2JJ8S0hinw2wDHurKJKyShO/2c5w3aLkX6M/OntQMRIwN3\n\
t1NT7FQ7R/zEi033HQJABZxlaVmEwwr8xRzI31EDL8PVuyFEUrTsxRlJ0BZ5xDYb\n\
saXezXDtSSbSuqJtqe4yEtAUwljxzpxMK72es4ZRHw==\n\
-----END RSA PRIVATE KEY-----';

var SECURE_CERT = __dirname + "/secure/tls-cert.pem";
var SECURE_CERT_TEXT = '-----BEGIN CERTIFICATE-----\n\
MIICrTCCAhYCCQC3zJs/9Fnk+jANBgkqhkiG9w0BAQUFADCBmjELMAkGA1UEBhMC\n\
VVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBGcmFuY2lzY28x\n\
ITAfBgNVBAoTGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDETMBEGA1UEAxMKU2Ft\n\
aXIgTmFpazEmMCQGCSqGSIb3DQEJARYXc2FtaXJAY2xlbWVudGluZWluYy5jb20w\n\
HhcNMTMwNzAxMjIyMDI5WhcNMTMwNzMxMjIyMDI5WjCBmjELMAkGA1UEBhMCVVMx\n\
EzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBGcmFuY2lzY28xITAf\n\
BgNVBAoTGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDETMBEGA1UEAxMKU2FtaXIg\n\
TmFpazEmMCQGCSqGSIb3DQEJARYXc2FtaXJAY2xlbWVudGluZWluYy5jb20wgZ8w\n\
DQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBAJ5K09opBDsvjWtkFQkmmWLnHqoQadC4\n\
4zjiSO012Kz0SwPZDe6ymuSPk05p6Ezp2kkC118tAvXHiYmc/UEIg19AaM8hEo9m\n\
IdUQjofR5DRiECP25wpJjPv4zhu09MdMmTNejSBpdIRdkpTV4TdRKadG5K5+hcBU\n\
8xfWQ2VvSrh9AgMBAAEwDQYJKoZIhvcNAQEFBQADgYEALrgLe5Wspn7lpPXFCT5U\n\
ptXHlLJHWbkD3Ub6mxTn8b/ZwqFZYFSxeGohWIyJqW+EY1F8byUA20jwkE5aOqq4\n\
hAvPaHua1a4lbtxRYXlksPJmUhXSe34XP15bHKQM5rk6ZjZuvXoCNqAfVEEC5PiM\n\
dLMrYBUgn+3BGsMOToTCSxg=\n\
-----END CERTIFICATE-----';

var moscaSettings = function() {
  var port = nextPort();
  var settings = {
    stats: false,
    logger: {
      level: "error"
    },
    persistence: {
      factory: mosca.persistence.Memory
    },
    secure: {
      port: port,
      keyPath: SECURE_KEY,
      certPath: SECURE_CERT
    }
  };

  // this is required to make the original server
  // test work
  // TODO refactor abstract test suite to take
  // the port as a parameter
  settings.port = port;

  return settings;
};

describe("mosca.Server - Secure Connection", function() {
  abstractServerTests(moscaSettings, require("./helpers/createSecureConnection"));
});

describe("mosca.Server - Secure and non-secure Connection", function() {
  var settings;
  var instance;
  var conn;

  afterEach(function(done) {
    if (conn) {
      conn.stream.end();
      conn.on("close", function() {
        instance.close(done);
      });
    } else {
      instance.close(done);
    }
  });

  it("should not allow non-secure connections with key and certificate as text", function(done) {
    settings = moscaSettings();
    settings.secure.keyPath = SECURE_KEY_TEXT;
    settings.secure.certPath = SECURE_CERT_TEXT;
    settings.secure.port = nextPort();

    instance = new mosca.Server(settings, function() {
      conn = createConnection(settings.port);
      conn.once("error", function(err) {
        conn = null;
        done();
      });
    });
  });

  it("should not allow non-secure connections", function(done) {
    settings = moscaSettings();
    settings.secure.port = nextPort();

    instance = new mosca.Server(settings, function() {
      conn = createConnection(settings.port);
      conn.once("error", function(err) {
        conn = null;
        done();
      });
    });
  });

  it("should allow non-secure connections", function(done) {
    settings = moscaSettings();
    settings.allowNonSecure = true;
    settings.secure.port = nextPort();

    instance = new mosca.Server(settings, function() {
      conn = createConnection(settings.port);
      conn.on("connected", function(err) {
       
        done();
      });
    });
  });
});
