import test from "node:test";
import assert from "node:assert/strict";
import { mariaDbOptionsFromUrl } from "../api/database.js";

test("parses a MariaDB URL and enforces TLS verification", () => {
  const options = mariaDbOptionsFromUrl("mariadb://app-user:p%40ss%23word@db.example.com:4018/fivezero2", {
    MARIADB_POOL_MAX: "4",
  });

  assert.equal(options.host, "db.example.com");
  assert.equal(options.port, 4018);
  assert.equal(options.user, "app-user");
  assert.equal(options.password, "p@ss#word");
  assert.equal(options.database, "fivezero2");
  assert.equal(options.timezone, "Z");
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.connectionLimit, 4);
});

test("requires an explicit database name and valid MySQL protocol", () => {
  assert.throws(() => mariaDbOptionsFromUrl("mariadb://user:pass@db.example.com:4018"), /database name/);
  assert.throws(() => mariaDbOptionsFromUrl("postgres://user:pass@db.example.com/app"), /mysql:\/\//);
});

test("adds an optional provider CA without disabling certificate checks", () => {
  const options = mariaDbOptionsFromUrl("mysql://app-user:pass@db.example.com/app", {
    MARIADB_SSL_CA: "-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----",
  });

  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.ca, "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----");
});
