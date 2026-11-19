import test from "node:test";
import assert from "node:assert/strict";
import { mariaDbOptionsFromUrl } from "../backend/database.js";
import { buildMariaDbWhereClause } from "../backend/mariadb-auth-adapter.js";
import { createMariaDbAuthTableStatements } from "../backend/mariadb-auth-schema.js";
import { getAuthTables } from "better-auth/db";

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
  assert.throws(() => mariaDbOptionsFromUrl("unsupported://user:pass@db.example.com/app"), /mysql:\/\//);
});

test("uses the bundled SkySQL CA chain only for SkySQL hosts", () => {
  const skySqlOptions = mariaDbOptionsFromUrl(
    "mariadb://app-user:pass@serverless-eu-north-1.sysp0000.db1.skysql.com:4018/fivezero2",
    {},
  );
  const otherOptions = mariaDbOptionsFromUrl("mariadb://app-user:pass@db.example.com/fivezero2", {});

  assert.equal(skySqlOptions.ssl.rejectUnauthorized, true);
  assert.equal((skySqlOptions.ssl.ca.match(/-----BEGIN CERTIFICATE-----/g) || []).length, 2);
  assert.equal(otherOptions.ssl.ca, undefined);
});

test("adds an optional provider CA without disabling certificate checks", () => {
  const options = mariaDbOptionsFromUrl("mysql://app-user:pass@db.example.com/app", {
    MARIADB_SSL_CA: "-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----",
  });

  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.ca, "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----");
});

test("builds parameterized MariaDB filters and joins empty IN predicates safely", () => {
  assert.deepEqual(
    buildMariaDbWhereClause([
      { field: "email", value: "Alice@Example.com", mode: "insensitive" },
      { field: "status", value: [], operator: "in" },
    ]),
    { sql: " WHERE LOWER(`email`) = ? AND 1 = 0", values: ["alice@example.com"] },
  );
});

test("rejects unsafe SQL identifiers and escapes LIKE wildcards", () => {
  assert.throws(
    () => buildMariaDbWhereClause([{ field: "email` OR 1=1 --", value: "attacker@example.com" }]),
    /invalid SQL identifier/,
  );

  const filter = buildMariaDbWhereClause([{ field: "email", value: "a%_b", operator: "contains" }]);
  assert.equal(filter.sql, " WHERE BINARY `email` LIKE ? ESCAPE '\\\\'");
  assert.deepEqual(filter.values, ["%a\\%\\_b%"]);
});

test("generates idempotent Better Auth table DDL from the current schema", () => {
  const statements = createMariaDbAuthTableStatements(getAuthTables({}));

  assert.equal(statements.length, 4);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS `user`/);
  assert.match(statements[0], /UNIQUE KEY `uniq_user_email`/);
  assert.match(statements[1], /FOREIGN KEY \(`userId`\) REFERENCES `user` \(`id`\) ON DELETE CASCADE/);
});
