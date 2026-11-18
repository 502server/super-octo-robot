import test from "node:test";
import assert from "node:assert/strict";
import {normalizeOrigin,isPrivateAddress,safeEqual} from "./security.js";
test("normalizes an HTTP origin",()=>assert.equal(normalizeOrigin("https://example.com/path"),"https://example.com"));
test("rejects loopback and non-http schemes",()=>{assert.throws(()=>normalizeOrigin("http://127.0.0.1"));assert.throws(()=>normalizeOrigin("file:///etc/passwd"))});
test("blocks private network ranges and compares secrets",()=>{assert.equal(isPrivateAddress("10.0.0.2"),true);assert.equal(isPrivateAddress("8.8.8.8"),false);assert.equal(safeEqual("abc","abc"),true);assert.equal(safeEqual("abc","abd"),false)});
