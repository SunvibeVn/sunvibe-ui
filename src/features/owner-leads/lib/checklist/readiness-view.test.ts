import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { emptyContent, P1, viewOf } from "./fixtures.test-support";
import { previewModel } from "./preview-model";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);

/** A checklist whose G1 has space P1 (code "P1"), with the given readiness. */
function viewWith(readiness: NonNullable<Parameters<typeof viewOf>[2]>["readiness"], available: boolean) {
  const content = emptyContent("PARTS");
  content.identification = {
    ...content.identification,
    spaces: [{ spaceId: P1, code: "P1", location: "Floor 1", description: null }],
  } as typeof content.identification;
  return viewOf(content, 1, { readiness, media: { available, uploadEnabled: available, setVersion: 1 } });
}

describe("evidence readiness (survey-media spec 4.6, 6.4)", () => {
  it("words each EVIDENCE_MISSING and EVIDENCE_PROCESSING item with its placement and category, linked to the panel", () => {
    const view = viewWith(
      {
        submissionAvailable: false,
        submissionUnavailableReason: "SUBMISSION_NOT_AVAILABLE",
        missing: [
          { group: "EVIDENCE", spaceId: null, field: "EXTERIOR_ACCESS", problem: "EVIDENCE_MISSING" },
          { group: "EVIDENCE", spaceId: P1, field: "KITCHEN", problem: "EVIDENCE_PROCESSING" },
          { group: "EVIDENCE", spaceId: P1, field: "MAIN_SPACE", problem: "EVIDENCE_MISSING" },
        ],
        unconfirmedTerms: [],
        warnings: [],
      },
      true,
    );
    expect(previewModel(view, t).gaps).toEqual([
      { text: "Photo missing: Asset (whole property) · Exterior and access", anchor: "cl-evidence" },
      { text: "Photo still processing: Space P1 · Kitchen", anchor: "cl-evidence" },
      { text: "Photo missing: Space P1 · Main space", anchor: "cl-evidence" },
    ]);
  });

  it("says submission is not available yet and comes later while photos are available (SUBMISSION_NOT_AVAILABLE)", () => {
    const view = viewWith(
      { submissionAvailable: false, submissionUnavailableReason: "SUBMISSION_NOT_AVAILABLE", missing: [], unconfirmedTerms: [], warnings: [] },
      true,
    );
    expect(previewModel(view, t).submission).toBe("Submission is not available yet. These lists may grow when submission and review are added.");
  });

  it("keeps the W16 texts when photos are not available (EVIDENCE_PENDING, EVIDENCE_NOT_AVAILABLE)", () => {
    const view = viewWith(
      {
        submissionAvailable: false,
        submissionUnavailableReason: "EVIDENCE_NOT_AVAILABLE",
        missing: [{ group: "EVIDENCE", spaceId: null, field: null, problem: "EVIDENCE_PENDING" }],
        unconfirmedTerms: [],
        warnings: [],
      },
      false,
    );
    const model = previewModel(view, t);
    expect(model.gaps).toEqual([{ text: "Photos: waiting for survey photos", anchor: "cl-evidence" }]);
    expect(model.submission).toBe(
      "Submission is not available until survey photos are built. These lists may grow when submission and review are added.",
    );
  });

  it("an evidence item of a category this UI does not know still says a photo is missing", () => {
    const view = viewWith(
      {
        submissionAvailable: false,
        submissionUnavailableReason: "SUBMISSION_NOT_AVAILABLE",
        missing: [{ group: "EVIDENCE", spaceId: null, field: "NEW_KIND", problem: "EVIDENCE_MISSING" }],
        unconfirmedTerms: [],
        warnings: [],
      },
      true,
    );
    expect(previewModel(view, t).gaps[0].text).toBe("Photo missing: Asset (whole property)");
  });
});

describe("en.json texts of survey photos (spec 6.2, 6.3, section 8)", () => {
  it("keeps the W16 texts for photos not available and has the photos-available ones", () => {
    const m = en.OwnerLeads.checklist;
    expect(m.page.media).toBe("Photos and submission open once survey photos are available. You can save and preview this draft now.");
    expect(m.evidence.text).toBe("Photos: waiting for survey photos. Photos and submission open once survey photos are available.");
    expect(m.page.laterRelease).toBe("Submission and review open in a later release.");
    expect(m.preview.problem.EVIDENCE_MISSING).toBe("Photo missing: {pair}");
    expect(m.preview.problem.EVIDENCE_PROCESSING).toBe("Photo still processing: {pair}");
    expect(en.OwnerLeads.history.photoAdded).toBe("Photo added: {category}");
    expect(en.OwnerLeads.history.photoRemoved).toBe("Photo removed: {category}");
  });

  it("has no Vietnamese letters in the photo texts (the workspace is English, C-41)", () => {
    const texts = JSON.stringify([en.OwnerLeads.checklist.media, en.OwnerLeads.checklist.preview, en.OwnerLeads.history]);
    expect(texts).not.toMatch(/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i);
  });
});
