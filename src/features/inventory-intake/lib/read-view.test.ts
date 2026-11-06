import { describe, expect, it } from "vitest";

import { viewAfterFailedRead } from "./read-view";

type View = { kind: "ready"; item: string } | { kind: "error" };

describe("viewAfterFailedRead", () => {
  const failed: View = { kind: "error" };

  it("shows the failure when nothing is on screen", () => {
    expect(viewAfterFailedRead<View>(null, failed)).toBe(failed);
    expect(viewAfterFailedRead<View>({ kind: "error" }, failed)).toBe(failed);
  });

  it("keeps what the user is working on: a background read must not take it away", () => {
    const ready: View = { kind: "ready", item: "x" };
    expect(viewAfterFailedRead<View>(ready, failed)).toBe(ready);
  });
});
