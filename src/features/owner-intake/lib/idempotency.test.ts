import { describe, expect, it } from "vitest";

import { createIdempotencyKeys, newIdempotencyKey } from "./idempotency";

// Server rule for the Idempotency-Key header (handoff 2.3).
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function counterKeys() {
  let n = 0;
  return createIdempotencyKeys(() => `key-0000-${++n}`);
}

describe("createIdempotencyKeys", () => {
  it("returns the same key for every retry of the same body", () => {
    const keys = counterKeys();
    const first = keys.keyFor('{"phone":"0909123456"}');
    expect(keys.keyFor('{"phone":"0909123456"}')).toBe(first);
    expect(keys.keyFor('{"phone":"0909123456"}')).toBe(first);
  });

  it("makes a new key as soon as the body changes", () => {
    const keys = counterKeys();
    const first = keys.keyFor('{"phone":"0909123456"}');
    const second = keys.keyFor('{"phone":"0909123457"}');
    expect(second).not.toBe(first);
    expect(keys.keyFor('{"phone":"0909123457"}')).toBe(second);
  });

  it("does not go back to an older key when an edit is undone", () => {
    const keys = counterKeys();
    const first = keys.keyFor("a");
    keys.keyFor("b");
    expect(keys.keyFor("a")).not.toBe(first);
  });

  it("renew() gives the same body a new key (after a 409)", () => {
    const keys = counterKeys();
    const first = keys.keyFor("a");
    keys.renew();
    const renewed = keys.keyFor("a");
    expect(renewed).not.toBe(first);
    expect(keys.keyFor("a")).toBe(renewed);
  });

  it("reset() forgets the key (after a success)", () => {
    const keys = counterKeys();
    const first = keys.keyFor("a");
    keys.reset();
    expect(keys.keyFor("a")).not.toBe(first);
  });

  it("uses crypto.randomUUID by default", () => {
    const keys = createIdempotencyKeys();
    const key = keys.keyFor("a");
    expect(key).toMatch(KEY_PATTERN);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("newIdempotencyKey", () => {
  it("uses randomUUID when the browser has it", () => {
    expect(newIdempotencyKey({ randomUUID: () => "11111111-2222-4333-8444-555555555555", getRandomValues: (a) => a })).toBe(
      "11111111-2222-4333-8444-555555555555",
    );
  });

  it("builds a v4 UUID from getRandomValues outside a secure context (no randomUUID, e.g. a phone over http)", () => {
    const key = newIdempotencyKey({ getRandomValues: (array) => crypto.getRandomValues(array) });
    expect(key).toMatch(KEY_PATTERN);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sets the version and variant bits even when every random byte is 0xff", () => {
    const key = newIdempotencyKey({ getRandomValues: (array) => array.fill(0xff) });
    expect(key).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});
