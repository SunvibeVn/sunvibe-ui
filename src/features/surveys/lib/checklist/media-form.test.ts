import { describe, expect, it } from "vitest";

import { P1 } from "./fixtures.test-support";
import { captionInput, categoriesFor, megabytes, remainingPlaces } from "./media-form";
import type { CoverageRow } from "./media-panel-model";

const row = (spaceId: string | null, category: CoverageRow["category"], state: CoverageRow["state"] = "MISSING"): CoverageRow => ({
  spaceId,
  spaceCode: spaceId ? "P101" : null,
  category,
  state,
  readyCount: 0,
  notRequiredReason: null,
});

describe("upload form rules (survey-media spec 6.2 Upload, A-11, A-12)", () => {
  it("offers the categories the server allows at the placement, in the order of 4.6", () => {
    const coverage = [
      row(null, "DETAIL", "OPTIONAL"),
      row(null, "EXTERIOR_ACCESS"),
      row(P1, "KITCHEN", "NOT_REQUIRED"),
      row(P1, "MAIN_SPACE"),
      row(null, "SHARED_KITCHEN"),
      row(P1, "DETAIL", "OPTIONAL"),
    ];
    expect(categoriesFor(coverage, null)).toEqual(["EXTERIOR_ACCESS", "SHARED_KITCHEN", "DETAIL"]);
    expect(categoriesFor(coverage, P1)).toEqual(["MAIN_SPACE", "KITCHEN", "DETAIL"]);
    expect(categoriesFor(coverage, "unknown")).toEqual([]);
  });

  it("checks the caption: blank is none, at most 200 characters, no phone number", () => {
    expect(captionInput("   ")).toEqual({ caption: null, problem: null });
    expect(captionInput("  Front gate  ")).toEqual({ caption: "Front gate", problem: null });
    expect(captionInput("x".repeat(201))).toMatchObject({ problem: "tooLong" });
    expect(captionInput("Call 0901 234 567")).toMatchObject({ problem: "phone" });
  });

  it("words file sizes in MB and counts the places left (hints only)", () => {
    expect(megabytes(20_971_520)).toBe("20");
    expect(megabytes(2_411_724)).toBe("2.3");
    expect(megabytes(1000)).toBe("0.1");
    expect(remainingPlaces({ maxSelected: 100, selectedCount: 97 })).toBe(3);
    expect(remainingPlaces({ maxSelected: 100, selectedCount: 104 })).toBe(0);
  });
});
