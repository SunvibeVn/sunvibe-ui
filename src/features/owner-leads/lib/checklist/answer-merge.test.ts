import { describe, expect, it } from "vitest";

import { applyAnswer, otherGroupVersions } from "./answer-merge";
import { emptyContent, viewOf } from "./fixtures.test-support";

function withVersions(versions: Partial<Record<string, number>>, marker: string) {
  const view = viewOf(emptyContent(), 1, { readiness: { submissionAvailable: false, missing: [], unconfirmedTerms: [], warnings: [] } });
  for (const [group, version] of Object.entries(versions)) {
    const entry = view.groups![group as "parts"]!;
    entry.version = version;
    entry.updatedByName = marker;
  }
  view.updatedAt = marker;
  return view;
}

describe("applyAnswer (W16-27: out-of-order answers never roll a group back)", () => {
  it("applies a newer answer whole", () => {
    const screen = withVersions({}, "screen");
    const answer = withVersions({ dimensions: 2 }, "answer");
    const result = applyAnswer(screen, answer);
    expect(result.needsReload).toBe(false);
    expect(result.view.groups!.dimensions!.version).toBe(2);
    expect(result.view.updatedAt).toBe("answer");
  });

  it("never rolls a group back when an older answer arrives after a newer one", () => {
    // Saves of G3 then G8 answered out of order: the G8 answer (newer G3? no) arrives first.
    const screen = withVersions({ dimensions: 2, terms: 2 }, "screen");
    const olderAnswer = withVersions({ dimensions: 2, terms: 1 }, "old");
    const result = applyAnswer(screen, olderAnswer);
    expect(result.view.groups!.terms!.version).toBe(2);
    expect(result.view.groups!.terms!.updatedByName).toBe("screen");
    expect(result.view.updatedAt).toBe("screen");
    expect(result.needsReload).toBe(true);
  });

  it("takes the groups that are newer and reads again for the computed parts when another group is older", () => {
    const screen = withVersions({ dimensions: 1, terms: 2 }, "screen");
    const answer = withVersions({ dimensions: 2, terms: 1 }, "answer");
    const result = applyAnswer(screen, answer);
    expect(result.view.groups!.dimensions!.version).toBe(2);
    expect(result.view.groups!.dimensions!.updatedByName).toBe("answer");
    expect(result.view.groups!.terms!.updatedByName).toBe("screen");
    expect(result.needsReload).toBe(true);
    expect(result.applied).toEqual(["dimensions"]);
  });
});

describe("otherGroupVersions (A-12)", () => {
  it("names every group's version on screen except G1", () => {
    const view = withVersions({ parts: 3, dimensions: 4, condition: 5, safety: 6, amenities: 7, terms: 8 }, "x");
    expect(otherGroupVersions(view)).toEqual({ parts: 3, dimensions: 4, condition: 5, safety: 6, amenities: 7, terms: 8 });
  });
});
