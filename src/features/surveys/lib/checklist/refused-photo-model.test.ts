import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { OwnerLeadsKey } from "@/features/lead-shared";
import en from "@/i18n/messages/en.json";

import type { ChecklistRefusedPhoto, ChecklistSubmittedEvidence } from "../../types";
import { emptyContent, viewOf } from "./fixtures.test-support";
import { notCarriedLines, sameContentLines } from "./refused-photo-model";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);

const refused = (photo: Partial<ChecklistRefusedPhoto> = {}): ChecklistRefusedPhoto => ({
  mediaId: "X",
  checklistId: "R1",
  checklistNo: 1,
  category: "KITCHEN",
  spaceId: "S1",
  spaceCode: "P1",
  reason: "Blurred",
  ...photo,
});

const frozen = (mediaId: string, refusedSameContent?: ChecklistRefusedPhoto[]): ChecklistSubmittedEvidence => ({
  mediaId,
  category: "KITCHEN",
  spaceCode: "P1",
  fullSha256: "a".repeat(64),
  ...(refusedSameContent === undefined ? {} : { refusedSameContent }),
});

const submitted = (evidence: ChecklistSubmittedEvidence[]) =>
  viewOf(emptyContent(), 1, { checklistNo: 2, status: "SUBMITTED", submission: { evidence } });

const withNotCarried = (refusedNotCarried?: ChecklistRefusedPhoto[]) =>
  viewOf(emptyContent(), 1, {
    checklistNo: 2,
    media: { available: true, uploadEnabled: true, setVersion: 1, ...(refusedNotCarried === undefined ? {} : { refusedNotCarried }) },
  });

describe("sameContentLines (survey-checklist SV-310 RU-1: the Review tab names a photo that repeats a refused one)", () => {
  it("gives one line per refusal under the frozen photo, and no key for a photo with an empty list", () => {
    const lines = sameContentLines(submitted([frozen("M1", [refused()]), frozen("M2", [])]), t);
    expect(lines).toEqual({
      M1: [{ key: "R1:X", text: "Same image as a photo not accepted in revision #1 (Space P1 · Kitchen): Blurred" }],
    });
    expect(Object.hasOwn(lines, "M2")).toBe(false);
  });

  it("keeps the server's order of two refusals (newest revision first)", () => {
    const newer = refused({ mediaId: "Y", checklistId: "R2", checklistNo: 2, reason: "Too dark" });
    expect(sameContentLines(submitted([frozen("M1", [newer, refused()])]), t).M1).toEqual([
      { key: "R2:Y", text: "Same image as a photo not accepted in revision #2 (Space P1 · Kitchen): Too dark" },
      { key: "R1:X", text: "Same image as a photo not accepted in revision #1 (Space P1 · Kitchen): Blurred" },
    ]);
  });

  it("names the asset placement of a photo without a space", () => {
    const asset = refused({ spaceId: null, spaceCode: null, category: "EXTERIOR_ACCESS" });
    expect(sameContentLines(submitted([frozen("M1", [asset])]), t).M1).toEqual([
      {
        key: "R1:X",
        text: "Same image as a photo not accepted in revision #1 (Asset (whole property) · Exterior and access): Blurred",
      },
    ]);
  });

  it("skips a refused item without a media id", () => {
    expect(sameContentLines(submitted([frozen("M1", [{ ...refused(), mediaId: undefined }])]), t)).toEqual({});
  });
});

describe("notCarriedLines (survey-checklist SV-310 RU-2: the Photos group names refused photos not carried)", () => {
  it("gives one line per refused photo the revision does not hold", () => {
    expect(notCarriedLines(withNotCarried([refused()]), t)).toEqual([
      { key: "R1:X", text: "Space P1 · Kitchen: Blurred (revision #1)" },
    ]);
  });

  it("keeps the server's order and names the asset placement", () => {
    const asset = refused({ mediaId: "Y", checklistId: "R2", checklistNo: 2, spaceId: null, spaceCode: null, category: "EXTERIOR_ACCESS", reason: "Too dark" });
    expect(notCarriedLines(withNotCarried([asset, refused()]), t)).toEqual([
      { key: "R2:Y", text: "Asset (whole property) · Exterior and access: Too dark (revision #2)" },
      { key: "R1:X", text: "Space P1 · Kitchen: Blurred (revision #1)" },
    ]);
  });

  it("skips a refused item without a media id", () => {
    expect(notCarriedLines(withNotCarried([{ ...refused(), mediaId: undefined }]), t)).toEqual([]);
  });
});

describe("an answer without the SV-310 fields (a server without them) shows nothing and does not fail", () => {
  it("gives nothing", () => {
    expect(sameContentLines(viewOf(emptyContent()), t)).toEqual({});
    expect(sameContentLines(submitted([frozen("M1"), frozen("M2")]), t)).toEqual({});
    expect(notCarriedLines(viewOf(emptyContent()), t)).toEqual([]);
    expect(notCarriedLines(withNotCarried(), t)).toEqual([]);
  });
});
