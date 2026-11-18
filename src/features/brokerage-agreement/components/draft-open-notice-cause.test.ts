import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

describe("DraftOpenNotice, its text (brokerage-agreement E05-S6, S6-D24, UF-2)", () => {
  it("draftOpenNotice_noticeValue_causeNeutral: the notice beside Open a new draft names no single cause, so it is true after each of the four", () => {
    expect(en.BrokerageAgreement.newDraft.notice).toBe(
      "The latest version did not take effect. Its line in the list of versions says why. Open a new draft to send the owner a changed version.",
    );
  });
});
