import { describe, expect, it } from "vitest";

import { ownerReasonText, ownerStatusText } from "./owner-status-text";

describe("ownerStatusText (brokerage-agreement E05-S5, spec section 6)", () => {
  it("ownerStatusText_eachState_itsKey: each effective version state reads the owner's text, an AWAITING_OWNER version only while it can be answered", () => {
    expect(ownerStatusText("AWAITING_OWNER", true)).toBe("owner.state.awaiting");
    expect(ownerStatusText("OWNER_CONFIRMED", false)).toBe("owner.state.confirmed");
    expect(ownerStatusText("OWNER_REJECTED", false)).toBe("owner.state.rejected");
    expect(ownerStatusText("LAPSED", false)).toBe("owner.state.lapsed");
    expect(ownerStatusText("CANCELLED", false)).toBe("owner.state.cancelled");
    // Not answerable now (the server gave no statement), or a state the owner does not act on: Sunvibe handles it.
    expect(ownerStatusText("AWAITING_OWNER", false)).toBe("owner.state.handling");
    for (const status of ["DRAFT", "SUPERSEDED", "SOMETHING_NEW", ""]) {
      expect(ownerStatusText(status, false)).toBe("owner.state.handling");
    }
  });

  it("ownerStatusText_activationStates_theirTexts: an activated, an effective and a refused version read their own texts; a lapsed one still the lapse key (brokerage-agreement E05-S6, S6-D19, UF-4)", () => {
    expect(ownerStatusText("ACTIVATED", false)).toBe("owner.state.activated");
    expect(ownerStatusText("EFFECTIVE", false)).toBe("owner.state.effective");
    expect(ownerStatusText("ACTIVATION_REFUSED", false)).toBe("owner.state.activationRefused");
    expect(ownerStatusText("LAPSED", false)).toBe("owner.state.lapsed");
  });

  it("ownerStatusText_reasonGroups_ownersText: each reason group that stops a confirmation reads the owner's text, an unknown one its OTHER text", () => {
    expect(["BASIS", "PROPERTY", "UNIT", "OWNER", "NEW_GROUP", ""].map(ownerReasonText)).toEqual([
      "owner.reasons.BASIS",
      "owner.reasons.PROPERTY",
      "owner.reasons.UNIT",
      "owner.reasons.OWNER",
      "owner.reasons.OTHER",
      "owner.reasons.OTHER",
    ]);
  });
});
