import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ChecklistDecision, ChecklistSubmittedEvidence } from "@/features/surveys";
import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { emptyContent, viewOf } from "./fixtures.test-support";
import { decisionPanelModel, photoTitle, statusBanner } from "./status-model";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);

const reviewer = { userId: "U2", name: "Binh Leader" };
const decidedAt = "2026-11-04T03:00:00Z";

const decided = (decision: Partial<ChecklistDecision>, extra: object = {}) =>
  viewOf(emptyContent(), 1, {
    status: decision.outcome ?? "PASSED",
    decision: { reviewer, decidedAt, ...decision },
    ...extra,
  });

describe("statusBanner (survey-checklist submission spec 6.1)", () => {
  it("shows nothing on a draft", () => {
    expect(statusBanner(viewOf(emptyContent()), t)).toBeNull();
  });

  it("names who submitted and when", () => {
    const view = viewOf(emptyContent(), 1, {
      status: "SUBMITTED",
      submission: { submittedBy: { userId: "U1", name: "Anh Sale" }, submittedAt: decidedAt, evidence: [] },
    });
    expect(statusBanner(view, t)).toEqual({
      tone: "info",
      text: "Submitted by Anh Sale on 04/11/2026 10:00. Waiting for review.",
    });
  });

  it("names the outcome, the kind, the reviewer and the date of each decision", () => {
    const line = (decision: Partial<ChecklistDecision>) => statusBanner(decided(decision), t)?.text;
    expect(line({ outcome: "PASSED" })).toBe("Passed · reviewed by Binh Leader on 04/11/2026 10:00");
    expect(line({ outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY" })).toBe(
      "Needs changes (documents) · reviewed by Binh Leader on 04/11/2026 10:00",
    );
    expect(line({ outcome: "NEEDS_CHANGES", needsChangesKind: "RESURVEY_REQUIRED" })).toBe(
      "Needs changes (re-survey) · reviewed by Binh Leader on 04/11/2026 10:00",
    );
    expect(line({ outcome: "FAILED", failedKind: "OUT_OF_SCOPE" })).toBe(
      "Failed (out of scope) · reviewed by Binh Leader on 04/11/2026 10:00",
    );
    expect(line({ outcome: "FAILED", failedKind: "NOT_ACCEPTED" })).toBe(
      "Failed (not accepted) · reviewed by Binh Leader on 04/11/2026 10:00",
    );
    expect(line({ outcome: "FAILED", failedKind: "TEMPORARY" })).toBe(
      "Failed (temporary) · reviewed by Binh Leader on 04/11/2026 10:00",
    );
  });

  it("uses the success tone for a pass only", () => {
    expect(statusBanner(decided({ outcome: "PASSED" }), t)?.tone).toBe("success");
    expect(statusBanner(decided({ outcome: "FAILED", failedKind: "TEMPORARY" }), t)?.tone).toBe("info");
  });

  it("never shows the review reason or notes", () => {
    const banner = statusBanner(decided({ outcome: "FAILED", failedKind: "TEMPORARY", reason: "SECRET", notes: "PRIVATE" }), t);
    expect(banner?.text).not.toMatch(/SECRET|PRIVATE/);
  });

  it("says Unknown for a person without a name", () => {
    const view = decided({ outcome: "PASSED", reviewer: { userId: "U2", name: null } });
    expect(statusBanner(view, t)?.text).toBe("Passed · reviewed by Unknown on 04/11/2026 10:00");
  });
});

describe("decisionPanelModel (spec 6.1: for every lead viewer)", () => {
  const evidence = (entry: Partial<ChecklistSubmittedEvidence>): ChecklistSubmittedEvidence => ({
    mediaId: "M1",
    category: "KITCHEN",
    fullSha256: "a".repeat(64),
    ...entry,
  });

  it("is null before a decision", () => {
    expect(decisionPanelModel(viewOf(emptyContent(), 1, { status: "SUBMITTED" }), t)).toBeNull();
  });

  it("gives outcome, kind, reviewer, date, reason, notes and limitations", () => {
    const view = decided({ outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: "Bring the land paper", notes: "Keep the photos" });
    expect(decisionPanelModel(view, t)).toEqual({
      outcome: "Needs changes (documents)",
      reviewer: "Binh Leader",
      when: "04/11/2026 10:00",
      reason: "Bring the land paper",
      notes: "Keep the photos",
      limitations: null,
      marks: [],
      passedNotes: [],
    });
  });

  it("lists the photos the reviewer did not accept with their reason, never the accepted ones", () => {
    const view = decided(
      { outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: "x" },
      {
        submission: {
          evidence: [
            evidence({ mediaId: "M1", accepted: true }),
            evidence({ mediaId: "M2", accepted: false, rejectionReason: "Blurred", spaceCode: "P101" }),
            evidence({ mediaId: "M3", accepted: false, rejectionReason: "Too dark", category: "EXTERIOR_ACCESS", spaceCode: null }),
          ],
        },
      },
    );
    expect(decisionPanelModel(view, t)?.marks).toEqual([
      { mediaId: "M2", photo: "Space P101 · Kitchen", reason: "Blurred" },
      { mediaId: "M3", photo: "Asset (whole property) · Exterior and access", reason: "Too dark" },
    ]);
  });

  it("I-3: numbers a mark, so one of two photos of a pair can be told apart", () => {
    const view = decided(
      { outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: "x" },
      { submission: { evidence: [evidence({ mediaId: "M2", accepted: false, rejectionReason: "Blurred", spaceCode: "P101" })] } },
    );
    const photoOf = (mediaId: string) => (mediaId === "M2" ? { mediaNo: 4, carriedFromChecklistNo: null } : null);
    expect(decisionPanelModel(view, t, photoOf)?.marks).toEqual([
      { mediaId: "M2", photo: "Photo #4 · Space P101 · Kitchen", reason: "Blurred" },
    ]);
  });

  it("names the revision of a carried photo: numbers restart in each revision", () => {
    expect(photoTitle({ mediaNo: 1, carriedFromChecklistNo: 2 }, "Space P1 · Kitchen", t)).toBe(
      "Photo #1 (from revision #2) · Space P1 · Kitchen",
    );
    expect(photoTitle({ mediaNo: 1, carriedFromChecklistNo: null }, "Space P1 · Kitchen", t)).toBe("Photo #1 · Space P1 · Kitchen");
    expect(photoTitle(null, "Space P1 · Kitchen", t)).toBe("Space P1 · Kitchen");
  });

  it("falls back to the pair when the list on screen does not hold the photo", () => {
    const view = decided(
      { outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: "x" },
      { submission: { evidence: [evidence({ mediaId: "M2", accepted: false, rejectionReason: "Blurred", spaceCode: "P101" })] } },
    );
    expect(decisionPanelModel(view, t, () => null)?.marks[0].photo).toBe("Space P101 · Kitchen");
  });

  it("takes the outcome of a decision without one from the status, never a default of Passed", () => {
    const failed = viewOf(emptyContent(), 1, { status: "FAILED", decision: { reviewer, decidedAt } });
    expect(decisionPanelModel(failed, t)?.outcome).toBe("Failed");
    const unknown = viewOf(emptyContent(), 1, { status: "SUBMITTED", decision: { reviewer, decidedAt } });
    expect(decisionPanelModel(unknown, t)?.outcome).toBe("Decided");
    expect(decisionPanelModel(unknown, t)?.passedNotes).toEqual([]);
  });

  it("says what a pass is not (US-3 AC-3, D3-1)", () => {
    const view = decided({ outcome: "PASSED", limitations: "Roof not seen" }, { passed: { usable: true, reason: null } });
    const model = decisionPanelModel(view, t);
    expect(model?.limitations).toBe("Roof not seen");
    expect(model?.passedNotes).toEqual([
      "Internal site record only. It is not a legal, ownership, photo-permission or advertising approval.",
    ]);
  });

  it("says why a pass stopped being usable; a hold can come back, lost content cannot", () => {
    const note = (reason: "INTENT_CHANGED" | "LEAD_CLOSED" | "EVIDENCE_HELD" | "EVIDENCE_GONE") =>
      decisionPanelModel(decided({ outcome: "PASSED" }, { passed: { usable: false, reason } }), t)?.passedNotes[1];
    expect(note("INTENT_CHANGED")).toBe("This pass no longer counts: the requirement changed.");
    expect(note("LEAD_CLOSED")).toBe("This pass no longer counts: the lead is closed.");
    expect(note("EVIDENCE_HELD")).toBe("A frozen photo is on hold. This pass counts again once the hold is released.");
    expect(note("EVIDENCE_GONE")).toBe("A frozen photo lost its content. This pass can no longer be used.");
  });
});

describe("the texts of the submit dialog (spec 6.1, D3-1)", () => {
  it("says the record is frozen and what it is not", () => {
    expect(t("checklist.submit.dialog.frozen")).toBe("The submitted record and its photos can no longer be changed.");
    expect(t("checklist.submit.dialog.site")).toBe("A site record, not a legal, safety or photo-permission check.");
  });
});
