import { describe, expect, it } from "vitest";

import { knownVersionOf, type MediaItem, type MediaList } from "@/features/surveys";

import { heldDetailsLost, heldMediaIds, withoutHeldDetails } from "./media-held-details";

const held = { at: "2026-11-03T02:00:00Z", byName: "Ann Admin", byUserId: "U-ADMIN", reason: "SECURITY_INCIDENT" as const };

const photo = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id,
  mediaNo: 1,
  status: "READY",
  caption: `Caption of ${id}`,
  captionHidden: false,
  contentAvailable: true,
  unavailableReason: null,
  held: null,
  removed: null,
  ...overrides,
});

/** A list as an ADMIN (`canHold`) gets it: held photos with caption, actor and reason. */
function adminList(): MediaList {
  return {
    checklistId: "C1",
    setVersion: 5,
    canHold: true,
    items: [photo("M1", { held }), photo("M2")],
    notAcceptedItems: [photo("M3", { status: "REJECTED", held, contentAvailable: false })],
    removedItems: [photo("M4", { removed: { at: "2026-11-03T03:00:00Z", byName: "Sam Sale" }, held, contentAvailable: false })],
  };
}

describe("withoutHeldDetails (SM-FE-07: a held photo's caption, actor and reason only while `canHold`)", () => {
  it("dropsCaptionActorReasonAndImage_ofEveryHeldPhoto_keepsTheHeldTime", () => {
    const list = withoutHeldDetails(adminList());

    expect(list.canHold).toBe(false);
    for (const item of [...(list.items ?? []), ...(list.notAcceptedItems ?? []), ...(list.removedItems ?? [])]) {
      if (item.id === "M2") continue;
      expect(item.caption).toBeNull();
      expect(item.captionHidden).toBe(true);
      expect(item.held).toEqual({ at: held.at, byName: null, byUserId: null, reason: null });
      expect(item.contentAvailable).toBe(false);
      expect(item.unavailableReason).toBe("HELD");
    }
    expect(JSON.stringify(list)).not.toMatch(/Ann Admin|U-ADMIN|SECURITY_INCIDENT|Caption of M1|Caption of M3|Caption of M4/);
  });

  it("claimsNoKnownVersion_soTheNextReadGetsTheWholeList", () => {
    const list = withoutHeldDetails({
      ...adminList(),
      basis: { identificationVersion: 2, conditionVersion: 1, checklistVersion: 3, stateEpoch: 1, viewDigest: "0a1b2c3d" },
    });
    expect(knownVersionOf(list)).toBeNull();
    expect(list.basis).toEqual({ identificationVersion: 2, conditionVersion: 1, checklistVersion: 3, stateEpoch: 1 });
  });

  it("leavesPhotosThatAreNotHeld_asTheyAre", () => {
    const list = withoutHeldDetails(adminList());
    expect(list.items?.[1]).toEqual(photo("M2"));
  });

  it("heldMediaIds_listsTheHeldPhotos", () => {
    expect(heldMediaIds(adminList())).toEqual(["M1", "M3", "M4"]);
  });
});

describe("heldDetailsLost (an answer says `canHold` is gone)", () => {
  it("aListWithoutCanHold_afterOneWithIt_isALoss_evenWhenTheOrderingRuleRefusesIt", () => {
    expect(heldDetailsLost(adminList(), { ...adminList(), canHold: false })).toBe(true);
    expect(heldDetailsLost(adminList(), { checklistId: "C1", setVersion: 4, items: [] })).toBe(true);
  });

  it("noLoss_whenCanHoldStays_orWasNeverThere", () => {
    expect(heldDetailsLost(adminList(), adminList())).toBe(false);
    expect(heldDetailsLost({ ...adminList(), canHold: false }, { ...adminList(), canHold: false })).toBe(false);
    expect(heldDetailsLost(null, { ...adminList(), canHold: false })).toBe(false);
  });
});
