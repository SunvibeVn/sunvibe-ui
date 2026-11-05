import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { historyActivityText } from "./history-activity-text";
import type { OwnerLeadsKey } from "./labels";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);

describe("historyActivityText (survey-schedule spec 6.3, A-12)", () => {
  it("labels a survey row with its appointment number", () => {
    expect(historyActivityText({ type: "SURVEY_BOOKED", referenceNo: 2 }, t)).toBe("Survey booked · #2");
    expect(historyActivityText({ type: "SURVEY_VISITED", referenceNo: 1 }, t)).toBe("Site visit recorded · #1");
  });

  it("labels a row without a reference by its type alone", () => {
    expect(historyActivityText({ type: "INTENT_CHANGED", referenceNo: null }, t)).toBe("Requirement changed");
    expect(historyActivityText({ type: "ASSIGNED" }, t)).toBe("Assigned");
  });

  it("adds the number to an existing row that moved or cancelled an appointment", () => {
    expect(historyActivityText({ type: "REASSIGNED", referenceNo: 3 }, t)).toBe("Reassigned · #3");
  });

  it("shows the note of a row that has one, as before", () => {
    expect(historyActivityText({ type: "NOTE_ADDED", note: "Called the owner" }, t)).toBe("Called the owner");
    expect(historyActivityText({ type: "NOTE_ADDED", note: "   " }, t)).toBe("Note");
  });

  it("gives a generic label for a type this UI does not know", () => {
    expect(historyActivityText({ type: "SOMETHING_NEW" as never }, t)).toBe(translator("history.activityOther"));
  });

  it("labels checklist rows with the checklist number and, for a save, the group (survey-checklist spec 6.4)", () => {
    expect(historyActivityText({ type: "CHECKLIST_STARTED", referenceNo: 1 }, t)).toBe("Checklist #1 started");
    expect(historyActivityText({ type: "CHECKLIST_TAKEN_OVER", referenceNo: 2 }, t)).toBe("Checklist #2 taken over");
    expect(historyActivityText({ type: "CHECKLIST_SAVED", referenceNo: 2, referenceDetail: "DIMENSIONS" }, t)).toBe(
      "Checklist #2: Size and layout saved",
    );
    expect(historyActivityText({ type: "CHECKLIST_SAVED", referenceNo: 3, referenceDetail: "TERMS" }, t)).toBe(
      "Checklist #3: Rental terms saved",
    );
  });

  it("labels the photo rows 'Photo added: <category>' and 'Photo removed: <category>' (survey-media A-10)", () => {
    expect(historyActivityText({ type: "CHECKLIST_MEDIA_ADDED", referenceNo: 1, referenceDetail: "KITCHEN" }, t)).toBe(
      "Photo added: Kitchen",
    );
    expect(historyActivityText({ type: "CHECKLIST_MEDIA_REMOVED", referenceNo: 2, referenceDetail: "EXTERIOR_ACCESS" }, t)).toBe(
      "Photo removed: Exterior and access",
    );
    expect(historyActivityText({ type: "CHECKLIST_MEDIA_ADDED", referenceNo: 1, referenceDetail: "SHARED_BATHROOM" }, t)).toBe(
      "Photo added: Shared bathroom",
    );
  });

  it("labels the submission, revision and review rows with the checklist number (survey-checklist 6.2)", () => {
    expect(historyActivityText({ type: "CHECKLIST_SUBMITTED", referenceNo: 1 }, t)).toBe("Checklist #1 submitted");
    expect(historyActivityText({ type: "CHECKLIST_REVISION_STARTED", referenceNo: 2 }, t)).toBe("Revision #2 started");
  });

  it("labels_reviewed_namesOutcomeOnly: the row names the outcome, never the kind (survey BR-4)", () => {
    const row = (referenceDetail: string) => historyActivityText({ type: "CHECKLIST_REVIEWED", referenceNo: 2, referenceDetail }, t);
    expect(row("PASSED")).toBe("Checklist #2 reviewed: Passed");
    expect(row("NEEDS_CHANGES:DOCUMENTS_ONLY")).toBe("Checklist #2 reviewed: Needs changes");
    expect(row("NEEDS_CHANGES:RESURVEY_REQUIRED")).toBe("Checklist #2 reviewed: Needs changes");
    expect(row("FAILED:OUT_OF_SCOPE")).toBe("Checklist #2 reviewed: Failed");
  });

  it("never shows a note on a review row (survey BR-4)", () => {
    expect(historyActivityText({ type: "CHECKLIST_REVIEWED", referenceNo: 2, referenceDetail: "PASSED", note: "PRIVATE" }, t)).toBe(
      "Checklist #2 reviewed: Passed",
    );
    expect(historyActivityText({ type: "CHECKLIST_REVIEWED", referenceNo: 2, note: "PRIVATE" }, t)).toBe("Checklist reviewed · #2");
  });

  it("history_requalificationLabel: names the checklist, and only the label without its number (U-2)", () => {
    expect(historyActivityText({ type: "REQUALIFICATION_MARKED", referenceNo: 2 }, t)).toBe("Checklist #2 requalified");
    expect(historyActivityText({ type: "REQUALIFICATION_MARKED", referenceNo: null }, t)).toBe("Survey requalified");
  });

  it("history_noReasonText: a requalification row shows the event only, whatever else it carries (survey BR-4)", () => {
    const row = historyActivityText(
      { type: "REQUALIFICATION_MARKED", referenceNo: 2, referenceDetail: "PRIVATE DETAIL", note: "PRIVATE REASON" },
      t,
    );
    expect(row).toBe("Checklist #2 requalified");
    expect(row).not.toContain("PRIVATE");
  });

  it("falls back to the plain label for a review row of an outcome this UI does not know", () => {
    expect(historyActivityText({ type: "CHECKLIST_REVIEWED", referenceNo: 2, referenceDetail: "OTHER" }, t)).toBe(
      "Checklist reviewed · #2",
    );
    expect(historyActivityText({ type: "CHECKLIST_REVIEWED", referenceNo: 2 }, t)).toBe("Checklist reviewed · #2");
  });

  it("falls back to the plain label for a photo row of a category this UI does not know", () => {
    expect(historyActivityText({ type: "CHECKLIST_MEDIA_ADDED", referenceNo: 2, referenceDetail: "NEW_CATEGORY" }, t)).toBe(
      "Photo added · #2",
    );
  });

  it("falls back to the plain label for a checklist save of a group this UI does not know", () => {
    expect(historyActivityText({ type: "CHECKLIST_SAVED", referenceNo: 2, referenceDetail: "NEW_GROUP" }, t)).toBe(
      "Checklist saved · #2",
    );
    expect(historyActivityText({ type: "CHECKLIST_STARTED", referenceNo: null }, t)).toBe("Checklist started");
  });
});
