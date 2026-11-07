import { describe, expect, it } from "vitest";

import { newClientId } from "./client-id";

describe("newClientId (survey-checklist A-23: ids of new spaces, hazards and other items are ULIDs made here)", () => {
  it("gives a 26-character Crockford ULID", () => {
    expect(newClientId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("encodes the time in the first ten characters, so later ids sort after earlier ones", () => {
    const early = newClientId(Date.UTC(2026, 9, 24, 2, 0, 0));
    const late = newClientId(Date.UTC(2026, 9, 24, 2, 0, 1));
    expect(early.slice(0, 10) < late.slice(0, 10)).toBe(true);
  });

  it("gives a new id each time", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newClientId()));
    expect(ids.size).toBe(200);
  });
});
