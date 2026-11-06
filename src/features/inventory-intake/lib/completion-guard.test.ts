import { describe, expect, it } from "vitest";

import { createCompletionGuard } from "./completion-guard";

describe("createCompletionGuard", () => {
  it("guard_doubleClick_onceOnly: a second click while the first runs sends nothing", () => {
    const guard = createCompletionGuard();
    expect(guard.enter()).toBe(true);
    expect(guard.enter()).toBe(false);
  });

  it("guard_doubleClick_onceOnly: nothing goes after a completion", () => {
    const guard = createCompletionGuard();
    guard.enter();
    guard.leave(true);
    expect(guard.enter()).toBe(false);
  });

  it("opens again after a refusal", () => {
    const guard = createCompletionGuard();
    guard.enter();
    guard.leave(false);
    expect(guard.enter()).toBe(true);
  });
});
