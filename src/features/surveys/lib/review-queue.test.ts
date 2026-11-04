import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { reviewHref, reviewReasonKey, reviewRows } from "./review-queue";

const t = createTranslator({ locale: "en", messages: en, namespace: "Surveys" });

const item = {
  checklistId: "C1",
  checklistNo: 2,
  leadId: "L1",
  leadCode: "SV-E2EA-AA2Q",
  submittedAt: "2026-11-04T03:00:00Z",
  submittedBy: { userId: "U1", name: "E2E Sale" },
  canReview: true,
  reason: null,
};

describe("reviewRows (survey-checklist submission spec 6.2, U-2)", () => {
  it("keeps the order of the answer: oldest submission first", () => {
    const rows = reviewRows({ items: [{ ...item, checklistId: "C1" }, { ...item, checklistId: "C2" }] });
    expect(rows.map((row) => row.checklistId)).toEqual(["C1", "C2"]);
  });

  it("gives what a row shows", () => {
    expect(reviewRows({ items: [item] })).toEqual([
      {
        checklistId: "C1",
        checklistNo: 2,
        leadId: "L1",
        leadCode: "SV-E2EA-AA2Q",
        submittedAt: "2026-11-04T03:00:00Z",
        submittedByName: "E2E Sale",
        canReview: true,
        reason: null,
      },
    ]);
  });

  it("leaves out an entry without ids and is empty without items", () => {
    expect(reviewRows({ items: [{ ...item, checklistId: undefined }, { ...item, leadId: undefined }] })).toEqual([]);
    expect(reviewRows({})).toEqual([]);
  });

  it("reads a row without a hint as one the viewer cannot review", () => {
    expect(reviewRows({ items: [{ ...item, canReview: undefined, submittedBy: undefined }] })[0]).toMatchObject({
      canReview: false,
      submittedByName: null,
    });
  });
});

describe("reviewHref", () => {
  it("opens the Review tab for a viewer who can review", () => {
    expect(reviewHref({ leadId: "L1", checklistId: "C1", canReview: true })).toBe(
      "/workspace/owner-leads/L1/survey-checklists/C1?tab=review",
    );
  });

  it("opens the checklist itself otherwise, and never puts more than ids in the URL", () => {
    expect(reviewHref({ leadId: "L/1", checklistId: "C1", canReview: false })).toBe("/workspace/owner-leads/L%2F1/survey-checklists/C1");
  });
});

describe("reviewReasonKey (U-2: the queue shows why)", () => {
  it("has a text for each reason", () => {
    const reasons = {
      NOT_REVIEWER_ROLE: "Only a sale leader, a sales manager or an admin reviews.",
      NOT_SUBMITTED: "This revision is not waiting for a decision.",
      LEAD_STATUS: "The lead is not in Survey Scheduled.",
      INTENT_CHANGED: "The requirement changed after this visit.",
      SERVING_DISABLED: "Photo viewing is off.",
      NOT_INDEPENDENT: "You took part in this visit or hold the lead, so someone else reviews it.",
    };
    for (const [reason, text] of Object.entries(reasons)) expect(t(reviewReasonKey(reason))).toBe(text);
  });

  it("has a general text for a reason this UI does not know, and for none", () => {
    expect(t(reviewReasonKey("OTHER"))).toBe("You cannot review this revision now.");
    expect(t(reviewReasonKey(null))).toBe("You cannot review this revision now.");
    expect(t(reviewReasonKey("toString"))).toBe("You cannot review this revision now.");
  });
});
