import { describe, expect, it } from "vitest";

import type { MediaItem } from "../../types";
import { P1, P2 } from "./fixtures.test-support";
import { photosRemovedByG1Save } from "./media-g1-hint";

const spaces = [
  { spaceId: P1, code: "P101" },
  { spaceId: P2, code: "P102" },
];
const photo = (id: string, spaceId: string | null, category: MediaItem["category"], extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  spaceId,
  category,
  status: "READY",
  removed: null,
  held: null,
  ...extra,
});

describe("photosRemovedByG1Save (survey-media A-9, spec 6.2 G1 editor hint)", () => {
  const items = [
    photo("M1", P1, "MAIN_SPACE"),
    photo("M2", P1, "KITCHEN", { held: { at: "2026-11-02T03:00:00Z", byUserId: null, byName: null, reason: null } }),
    photo("M3", P2, "MAIN_SPACE", { status: "PROCESSING" }),
    photo("M4", null, "SHARED_KITCHEN"),
    photo("M5", null, "SHARED_BATHROOM", { status: "AWAITING_CONTENT" }),
    photo("M6", null, "EXTERIOR_ACCESS"),
    photo("M7", null, "SHARED_AMENITY"),
  ];

  it("spaceRemoval_countsPhotosHeldIncluded: every selected photo of a removed space, held ones too", () => {
    const stored = { rentalScope: "PARTS", spaces };
    const input = { rentalScope: "PARTS", spaces: [spaces[1]] };
    expect(photosRemovedByG1Save(stored, input, items)).toBe(2);
  });

  it("partsToWholeOrNone_countsSharedPhotos: leaving PARTS ends the shared kitchen and bathroom placements", () => {
    const stored = { rentalScope: "PARTS", spaces };
    expect(photosRemovedByG1Save(stored, { rentalScope: "WHOLE", spaces }, items)).toBe(2);
    expect(photosRemovedByG1Save(stored, { rentalScope: null, spaces }, items)).toBe(2);
    expect(photosRemovedByG1Save(stored, { rentalScope: null, spaces: [] }, items)).toBe(5);
  });

  it("counts nothing for a save that ends no placement", () => {
    const stored = { rentalScope: "PARTS", spaces };
    expect(photosRemovedByG1Save(stored, { rentalScope: "PARTS", spaces }, items)).toBe(0);
    expect(photosRemovedByG1Save({ rentalScope: "WHOLE", spaces }, { rentalScope: "PARTS", spaces }, items)).toBe(0);
  });

  it("never counts a removed photo", () => {
    const stored = { rentalScope: "PARTS", spaces };
    const removed = [photo("M9", P1, "MAIN_SPACE", { removed: { at: "x", byUserId: "u", kind: "HOLDER" } })];
    expect(photosRemovedByG1Save(stored, { rentalScope: "PARTS", spaces: [] }, removed)).toBe(0);
  });
});
