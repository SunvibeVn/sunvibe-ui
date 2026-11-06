import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import {
  CHECKLIST_GROUP_LABEL,
  checklistGroupLabelKey,
  REQUALIFICATION_KIND_LABEL,
  requalificationKindKey,
} from "./label-text";

function resolve(path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (typeof node === "object" && node !== null && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, en.OwnerLeads);
}

describe("checklist groups and requalification kinds (survey-checklist spec 6.4)", () => {
  it("names every requalification kind (spec A-5)", () => {
    expect(Object.fromEntries(Object.entries(REQUALIFICATION_KIND_LABEL).map(([kind, key]) => [kind, resolve(key)]))).toEqual({
      WRONG_ASSET: "Wrong property",
      WRONG_OWNER: "Wrong owner",
      WRONG_PERSON: "Wrong surveyor",
      WRONG_SCOPE: "Wrong scope",
      NEED_CHANGED: "The need changed",
      PHOTO_PROBLEM: "Photo problem",
      HAZARD: "Hazard",
      OTHER: "Other",
    });
  });

  it("gives null for a requalification kind this UI does not know, never a raw code", () => {
    expect(requalificationKindKey("WRONG_ASSET")).toBe("checklist.requalification.kinds.WRONG_ASSET");
    expect(requalificationKindKey("NEW_KIND")).toBeNull();
    expect(requalificationKindKey(null)).toBeNull();
  });

  it("names every group with the spec 6.4 wording", () => {
    expect(Object.fromEntries(Object.entries(CHECKLIST_GROUP_LABEL).map(([group, key]) => [group, resolve(key)]))).toEqual({
      IDENTIFICATION: "Identification",
      PARTS: "Private and shared parts",
      DIMENSIONS: "Size and layout",
      CONDITION: "Condition and availability",
      SAFETY: "Access and risks",
      AMENITIES: "Amenities and furniture",
      EVIDENCE: "Photos",
      TERMS: "Rental terms",
    });
  });

  it("gives null for a group this UI does not know", () => {
    expect(checklistGroupLabelKey("TERMS")).toBe("checklist.groups.TERMS");
    expect(checklistGroupLabelKey("SOMETHING_NEW")).toBeNull();
    expect(checklistGroupLabelKey(null)).toBeNull();
  });
});
