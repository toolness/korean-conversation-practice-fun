import { describe, it, expect, beforeEach } from "bun:test";
import { cacheGet, cachePut, cacheDelete } from "../cache";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Override the cache dir for tests by monkey-patching the module
// Instead, we test the actual functions with unique prompts to avoid collisions
const testPrefix = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

function testPrompt(name: string): string {
  return `${testPrefix}_${name}`;
}

describe("cache", () => {
  it("cache miss returns null", () => {
    expect(cacheGet(testPrompt("nonexistent"))).toBeNull();
  });

  it("roundtrip put/get", () => {
    const prompt = testPrompt("roundtrip");
    cachePut(prompt, "response1");
    expect(cacheGet(prompt)).toBe("response1");
    cacheDelete(prompt);
  });

  it("delete removes entry", () => {
    const prompt = testPrompt("delete");
    cachePut(prompt, "value");
    expect(cacheGet(prompt)).toBe("value");
    cacheDelete(prompt);
    expect(cacheGet(prompt)).toBeNull();
  });

  it("delete missing is noop", () => {
    cacheDelete(testPrompt("nonexistent_delete"));
    // Should not throw
  });

  it("path is deterministic", () => {
    // Two puts with same prompt should overwrite
    const prompt = testPrompt("deterministic");
    cachePut(prompt, "first");
    cachePut(prompt, "second");
    expect(cacheGet(prompt)).toBe("second");
    cacheDelete(prompt);
  });
});
