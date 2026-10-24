import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { historyActivityText } from "./history-activity-text";
import type { OwnerLeadsKey } from "./labels";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey) => translator(key);

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
});
