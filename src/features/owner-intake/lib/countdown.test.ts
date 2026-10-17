import { describe, expect, it } from "vitest";

import { secondsLeft } from "./countdown";

const START = 1_760_000_000_000;

describe("secondsLeft", () => {
  it("is the full wait right after the 429", () => {
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START)).toBe(120);
  });

  it("counts whole seconds down, rounding up", () => {
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START + 1)).toBe(120);
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START + 999)).toBe(120);
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START + 1000)).toBe(119);
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START + 119_001)).toBe(1);
  });

  it("is 0 once the wait is over", () => {
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START + 120_000)).toBe(0);
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START + 500_000)).toBe(0);
  });

  it("never exceeds the wait when the clock goes back", () => {
    expect(secondsLeft({ startedAt: START, seconds: 120 }, START - 60_000)).toBe(120);
  });

  it("is 0 without a wait", () => {
    expect(secondsLeft({ startedAt: START, seconds: 0 }, START)).toBe(0);
  });
});
