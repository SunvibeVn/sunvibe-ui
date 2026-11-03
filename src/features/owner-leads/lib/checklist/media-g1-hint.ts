import type { MediaItem } from "@/features/surveys";

// The G1 editor hint (survey-media A-9, spec 6.2): a G1 save that removes a space, or changes the scope from PARTS to
// anything else, removes every selected photo on the placements it ends (held ones too). The page says how many before
// Save, from the photo list on screen; the server decides.

type G1Placements = { rentalScope: string | null; spaces: readonly { spaceId: string }[] };

/** The asset-level categories that exist only while the scope is PARTS (A-12). */
const PARTS_ONLY = new Set(["SHARED_KITCHEN", "SHARED_BATHROOM"]);

/** How many photos of `items` (the list's selected photos) the save from `stored` to `input` removes. */
export function photosRemovedByG1Save(stored: G1Placements, input: G1Placements, items: readonly MediaItem[]): number {
  const kept = new Set(input.spaces.map((space) => space.spaceId));
  const endedSpaces = new Set(stored.spaces.map((space) => space.spaceId).filter((spaceId) => !kept.has(spaceId)));
  const leavesParts = stored.rentalScope === "PARTS" && input.rentalScope !== "PARTS";
  return items.filter((item) => {
    if (item.removed) return false;
    if (item.spaceId) return endedSpaces.has(item.spaceId);
    return leavesParts && PARTS_ONLY.has(item.category ?? "");
  }).length;
}
