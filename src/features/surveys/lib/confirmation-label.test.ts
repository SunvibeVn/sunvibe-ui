import { describe, expect, it } from "vitest";

import { confirmationLabel } from "./confirmation-label";

describe("confirmationLabel (US-1 AC-3, AC-5, spec A-28, 6.6)", () => {
  it("reads Owner confirmed only for a CONFIRMED state", () => {
    expect(confirmationLabel({ state: "CONFIRMED", cause: null, everConfirmed: true })).toEqual({ key: "confirmed" });
  });

  it("reads Not confirmed by the owner for a booking never confirmed", () => {
    expect(confirmationLabel({ state: "UNCONFIRMED", cause: "NEW", everConfirmed: false })).toEqual({
      key: "notConfirmed",
    });
  });

  it("stays Not confirmed when an unconfirmed booking was moved or reassigned", () => {
    expect(confirmationLabel({ state: "UNCONFIRMED", cause: "TIME_CHANGED", everConfirmed: false })).toEqual({
      key: "notConfirmed",
    });
    expect(confirmationLabel({ state: "UNCONFIRMED", cause: "REASSIGNED", everConfirmed: false })).toEqual({
      key: "notConfirmed",
    });
  });

  it.each([
    ["TIME_CHANGED", "TIME_CHANGED"],
    ["LOCATION_CHANGED", "LOCATION_CHANGED"],
    ["REASSIGNED", "REASSIGNED"],
    ["USER", "USER"],
  ] as const)("reads Needs reconfirmation (%s) after an earlier confirmation", (cause, causeKey) => {
    expect(confirmationLabel({ state: "UNCONFIRMED", cause, everConfirmed: true })).toEqual({
      key: "needsReconfirmation",
      causeKey,
    });
  });

  it("reads Needs reconfirmation without a cause when the API sent none", () => {
    expect(confirmationLabel({ state: "UNCONFIRMED", cause: null, everConfirmed: true })).toEqual({
      key: "needsReconfirmation",
    });
  });

  it("never reads as agreed when the state is missing or unknown", () => {
    expect(confirmationLabel(null)).toEqual({ key: "notConfirmed" });
    expect(confirmationLabel(undefined)).toEqual({ key: "notConfirmed" });
    expect(confirmationLabel({ state: "MAYBE" as never, everConfirmed: true })).toEqual({ key: "needsReconfirmation" });
    expect(confirmationLabel({})).toEqual({ key: "notConfirmed" });
  });
});
