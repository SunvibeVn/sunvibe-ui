import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import {
  EMPTY_SUSPENSION_VALUES,
  releaseErrors,
  releaseServerErrors,
  suspensionErrors,
  suspensionServerErrors,
} from "./suspension-form";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("suspension and release forms (brokerage-agreement E05-S8, S8-D6, E05S8-P5)", () => {
  it("suspensionForm_checks_reasonRequiredNoteLength: a reason is required; the note is optional and at most 500 characters as the body sends it, padded or not", () => {
    expect(suspensionErrors(EMPTY_SUSPENSION_VALUES)).toEqual({ reasonType: "stop.fieldErrors.reasonType" });
    expect(t("stop.fieldErrors.reasonType")).toBe("Choose a reason.");
    expect(suspensionErrors({ reasonType: "COMPLAINT", note: "" })).toEqual({});
    expect(suspensionErrors({ reasonType: "COMPLAINT", note: "   " })).toEqual({});
    expect(suspensionErrors({ reasonType: "DISPUTE", note: "a".repeat(500) })).toEqual({});

    for (const note of ["a".repeat(501), ` ${"a".repeat(499)} `]) {
      expect(note).toHaveLength(501);
      expect(suspensionErrors({ reasonType: "COMPLAINT", note })).toEqual({ note: "stop.fieldErrors.note" });
    }
    expect(t("stop.fieldErrors.note")).toBe("Enter at most 500 characters.");
    // Both at once.
    expect(suspensionErrors({ reasonType: "", note: "a".repeat(501) })).toEqual({
      reasonType: "stop.fieldErrors.reasonType",
      note: "stop.fieldErrors.note",
    });
  });

  it("suspensionReleaseForm_checks_reasonRequiredNotBlankLength: the release reason is required, not blank, and at most 500 characters as sent", () => {
    for (const reason of ["", "   ", "a".repeat(501), ` ${"a".repeat(499)} `]) {
      expect(releaseErrors(reason)).toEqual({ reason: "stop.fieldErrors.releaseReason" });
    }
    expect(releaseErrors("a".repeat(500))).toEqual({});
    expect(releaseErrors(" Checked. ")).toEqual({});
    expect(t("stop.fieldErrors.releaseReason")).toBe("Enter a reason (at most 500 characters).");
  });

  it("suspensionForm_serverEntries_fieldErrors: a server 400 names the form's fields; a text refused by the server reads its character rule; any other field is not one of the form's", () => {
    expect(suspensionServerErrors(["note"])).toEqual({ errors: { note: "stop.fieldErrors.badText" }, other: false });
    expect(suspensionServerErrors(["reasonType", "note"])).toEqual({
      errors: { reasonType: "stop.fieldErrors.reasonType", note: "stop.fieldErrors.badText" },
      other: false,
    });
    expect(suspensionServerErrors(["somethingElse"])).toEqual({ errors: {}, other: true });
    expect(releaseServerErrors(["reason"])).toEqual({ errors: { reason: "stop.fieldErrors.badText" }, other: false });
    expect(releaseServerErrors(["expectedDataVersion"])).toEqual({ errors: {}, other: true });
    expect(t("stop.fieldErrors.badText")).toBe("This text cannot be saved. Remove special characters.");
  });
});
