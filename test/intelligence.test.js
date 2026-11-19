import test from "node:test";
import assert from "node:assert/strict";
import {validateIndicator} from "../backend/intelligence.js";

test("accepts supported IOC formats",()=>{
 assert.equal(validateIndicator("ip","8.8.8.8"),true);
 assert.equal(validateIndicator("domain","example.com"),true);
 assert.equal(validateIndicator("url","https://example.com/login"),true);
 assert.equal(validateIndicator("hash","a".repeat(64)),true);
 assert.equal(validateIndicator("email","security@example.com"),true);
 assert.equal(validateIndicator("cert","sha256 fingerprint "+ "a".repeat(20)),true);
});
test("rejects malformed and unsafe IOC values",()=>{
 assert.equal(validateIndicator("ip","999.1.1.1"),false);
 assert.equal(validateIndicator("domain","not a domain"),false);
 assert.equal(validateIndicator("url","javascript:alert(1)"),false);
 assert.equal(validateIndicator("url","https://user:pass@example.com"),false);
 assert.equal(validateIndicator("hash","xyz"),false);
 assert.equal(validateIndicator("email","not-an-email"),false);
});
