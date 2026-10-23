import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { CLOSED_STATUSES, LEAD_STATUSES, OPEN_STATUSES } from "../types";

import {
  ACTIVITY_LABEL,
  activityLabelKey,
  INTENT_LABEL,
  intentLabelKey,
  PRICE_UNIT_LABEL,
  PROPERTY_TYPE_LABEL,
  propertyTypeLabelKey,
  ROLE_LABEL,
  SOURCE_LABEL,
  sourceLabelKey,
  STATUS_LABEL,
  statusLabelKey,
  priceUnitLabelKey,
  WARD_TYPE_LABEL,
  wardTypeLabelKey,
} from "./labels";

function resolve(path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (typeof node === "object" && node !== null && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, en.OwnerLeads);
}

const MAPS = {
  STATUS_LABEL,
  INTENT_LABEL,
  PROPERTY_TYPE_LABEL,
  statusLabelKey,
  WARD_TYPE_LABEL,
  ACTIVITY_LABEL,
  ROLE_LABEL,
  PRICE_UNIT_LABEL,
  SOURCE_LABEL,
};

describe("label maps (W11-40)", () => {
  for (const [name, map] of Object.entries(MAPS)) {
    it(`${name}: every value has a non-empty string in en.json OwnerLeads`, () => {
      for (const [value, key] of Object.entries(map)) {
        const text = resolve(key);
        expect(typeof text, `${name}.${value} -> ${key}`).toBe("string");
        expect((text as string).length, `${name}.${value} -> ${key}`).toBeGreaterThan(0);
      }
    });
  }

  it("covers the expected enum values", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([
      "ASSIGNED",
      "CONTACTED",
      "DUPLICATE",
      "NEW",
      "ON_HOLD",
      "REJECTED",
      "WITHDRAWN",
    ]);
    expect(Object.keys(INTENT_LABEL).sort()).toEqual(["LONG_TERM_RENT", "SALE", "SHORT_TERM_RENT"]);
    expect(Object.keys(PROPERTY_TYPE_LABEL)).toEqual(["HOUSE", "WHOLE_BUILDING", "VILLA", "HOMESTAY", "CONDOTEL", "APARTMENT"]);
    expect(Object.keys(WARD_TYPE_LABEL).sort()).toEqual(["COMMUNE", "SPECIAL_ZONE", "WARD"]);
    expect(Object.keys(ACTIVITY_LABEL).sort()).toEqual([
      "ASSIGNED",
      "AUTO_ASSIGNED",
      "NOTE_ADDED",
      "REASSIGNED",
      "STATUS_CHANGED",
      "SUBMITTED",
    ]);
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(["SALE", "SALE_LEADER"]);
    expect(Object.keys(PRICE_UNIT_LABEL).sort()).toEqual(["MONTH", "NIGHT", "TOTAL"]);
  });
});

describe("status labels (W14 C-45, spec 5.5)", () => {
  const text = (status: keyof typeof STATUS_LABEL) => resolve(STATUS_LABEL[status]);

  it("uses the owner wording", () => {
    expect(text("NEW")).toBe("Unassigned");
    expect(text("ASSIGNED")).toBe("Assigned");
    expect(text("CONTACTED")).toBe("Contacted");
    expect(text("ON_HOLD")).toBe("On Hold");
    expect(text("DUPLICATE")).toBe("Duplicate");
    expect(text("REJECTED")).toBe("Declined");
    expect(text("WITHDRAWN")).toBe("Owner Withdrawn");
  });

  it("uses the spec 5.5 activity and role wording", () => {
    expect(resolve(ACTIVITY_LABEL.SUBMITTED)).toBe("Owner submitted the form");
    expect(resolve(ACTIVITY_LABEL.AUTO_ASSIGNED)).toBe("Auto-assigned by ward");
    expect(resolve(ACTIVITY_LABEL.ASSIGNED)).toBe("Assigned");
    expect(resolve(ACTIVITY_LABEL.REASSIGNED)).toBe("Reassigned");
    expect(resolve(ACTIVITY_LABEL.STATUS_CHANGED)).toBe("Status changed");
    expect(resolve(ACTIVITY_LABEL.NOTE_ADDED)).toBe("Note");
    expect(resolve(ROLE_LABEL.SALE)).toBe("Sale");
    expect(resolve(ROLE_LABEL.SALE_LEADER)).toBe("Sale leader");
  });
});

describe("status groups", () => {
  it("splits the seven W9 statuses into open and closed", () => {
    expect([...OPEN_STATUSES]).toEqual(["NEW", "ASSIGNED", "CONTACTED", "ON_HOLD"]);
    expect([...CLOSED_STATUSES]).toEqual(["DUPLICATE", "REJECTED", "WITHDRAWN"]);
    expect([...OPEN_STATUSES, ...CLOSED_STATUSES].sort()).toEqual([...LEAD_STATUSES].sort());
  });
});

describe("statusLabelKey", () => {
  it("returns the W9 label for the seven statuses", () => {
    for (const status of LEAD_STATUSES) expect(statusLabelKey(status)).toBe(STATUS_LABEL[status]);
  });

  it("falls back to a generic label for the other API statuses and for no status", () => {
    for (const status of ["VALIDATING", "SURVEY_SCHEDULED", "QUALIFIED", "AGREEMENT_PENDING", "ONBOARDED", "", "x"]) {
      const key = statusLabelKey(status);
      expect(key).toBe("statusUnknown");
      expect(typeof resolve(key)).toBe("string");
    }
    expect(statusLabelKey(undefined)).toBe("statusUnknown");
    expect(statusLabelKey("toString")).toBe("statusUnknown");
  });
});

describe("source and activity fallbacks", () => {
  it("labels the five sources and falls back for an unknown one", () => {
    expect(Object.keys(SOURCE_LABEL).sort()).toEqual(["OUTBOUND", "PARTNER", "REFERRAL", "STAFF_ENTRY", "WEB"]);
    expect(sourceLabelKey("WEB")).toBe("source.WEB");
    expect(sourceLabelKey("TELEPATHY")).toBe("sourceUnknown");
    expect(sourceLabelKey(undefined)).toBe("sourceUnknown");
    expect(typeof resolve("sourceUnknown")).toBe("string");
  });

  it("falls back to a generic activity label", () => {
    expect(activityLabelKey("NOTE_ADDED")).toBe("activity.NOTE_ADDED");
    expect(activityLabelKey("SOMETHING_NEW")).toBe("history.activityOther");
    expect(activityLabelKey(undefined)).toBe("history.activityOther");
    expect(typeof resolve("history.activityOther")).toBe("string");
  });
});

describe("intent and property type keys", () => {
  it("returns the label key of a known value", () => {
    expect(intentLabelKey("SHORT_TERM_RENT")).toBe("intent.SHORT_TERM_RENT");
    expect(propertyTypeLabelKey("HOMESTAY")).toBe("propertyType.HOMESTAY");
  });

  it("returns null for none (the API sends null), an empty or an unknown value, never a raw code", () => {
    for (const value of [null, undefined, "", "toString", "CASTLE"]) {
      expect(intentLabelKey(value)).toBeNull();
      expect(propertyTypeLabelKey(value)).toBeNull();
    }
  });

  it("treats the property types the API sent before W13a as unknown", () => {
    for (const value of ["STUDIO", "TWO_BEDROOM", "PENTHOUSE", "TOWNHOUSE", "LAND", "OTHER"]) {
      expect(propertyTypeLabelKey(value), value).toBeNull();
    }
  });
});

describe("ward type and price unit keys", () => {
  it("returns the label key of a known value", () => {
    expect(wardTypeLabelKey("WARD")).toBe("wardType.WARD");
    expect(priceUnitLabelKey("MONTH")).toBe("priceUnit.MONTH");
  });

  it("returns null for none (null from the API), an empty or an unknown value", () => {
    for (const value of [null, undefined, "", "toString", "HAMLET"]) {
      expect(wardTypeLabelKey(value)).toBeNull();
      expect(priceUnitLabelKey(value)).toBeNull();
    }
  });
});
