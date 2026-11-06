import { describe, expect, it } from "vitest";

import { createLastListUrl } from "./last-list-url";

describe("createLastListUrl (CR-10: the detail's back link, in memory only)", () => {
  it("gives the last list URL back to the user who opened it", () => {
    const last = createLastListUrl();
    expect(last.get("U1")).toBeNull();
    last.set("U1", "/workspace/owner-leads?scope=all&ward=20275");
    last.set("U1", "/workspace/owner-leads?scope=mine&page=2");
    expect(last.get("U1")).toBe("/workspace/owner-leads?scope=mine&page=2");
    // Read as often as needed (not one-shot).
    expect(last.get("U1")).toBe("/workspace/owner-leads?scope=mine&page=2");
  });

  it("never hands one user's list URL to another user", () => {
    const last = createLastListUrl();
    last.set("U1", "/workspace/owner-leads?scope=all");
    expect(last.get("U2")).toBeNull();
  });

  it("is dropped on a user change or a sign-out", () => {
    const last = createLastListUrl();
    last.set("U1", "/workspace/owner-leads?scope=all");
    last.resetFor("U1");
    expect(last.get("U1")).toBe("/workspace/owner-leads?scope=all");
    last.resetFor("U2");
    expect(last.get("U1")).toBeNull();

    last.set("U1", "/workspace/owner-leads?scope=all");
    last.resetFor(null);
    expect(last.get("U1")).toBeNull();
  });

  it("keeps only list URLs: anything else is ignored", () => {
    const last = createLastListUrl();
    last.set("U1", "/workspace/owner-leads?scope=mine");
    last.set("U1", "https://evil.example/workspace/owner-leads");
    last.set("U1", "/workspace/owner-leads/01JE2EHEAD0000000000000001");
    last.set("U1", "//evil.example");
    expect(last.get("U1")).toBe("/workspace/owner-leads?scope=mine");
  });
});
