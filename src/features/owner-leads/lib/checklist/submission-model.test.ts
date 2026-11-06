import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ChecklistReadiness } from "@/features/surveys";
import en from "@/i18n/messages/en.json";

import { emptyContent, viewOf } from "./fixtures.test-support";
import {
  createInFlightGuard,
  gateTextKey,
  submitFailureStep,
  submitPanelState,
} from "./submission-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });

const view = (readiness: object, overrides: object = {}) =>
  viewOf(emptyContent(), 1, {
    readiness: { missing: [], unconfirmedTerms: [], warnings: [], submissionAvailable: false, ...readiness },
    ...overrides,
  });

describe("submitPanelState (survey-checklist submission spec 6.1, U-1)", () => {
  it("offers the submit on an editable draft when the read says it is available", () => {
    expect(submitPanelState(view({ submissionAvailable: true }))).toEqual({ kind: "available" });
  });

  it("submissionModel_firstGateText: names the first failing gate instead of the button", () => {
    const reasons = {
      SUBMISSION_NOT_AVAILABLE: "Submission is not open yet.",
      EVIDENCE_NOT_AVAILABLE: "Survey photos are not available, so this checklist cannot be submitted yet.",
      APPOINTMENT_SCHEDULED: "A survey is still scheduled on this lead. Record or cancel it first.",
      MISSING_ITEMS: "Some required items are missing. See the list above.",
      PHOTOS_NOT_FINISHED: "Some photos are still uploading or processing.",
      PHOTO_LIMIT: "Too many photos are selected. Remove some first.",
      PHOTO_UNAVAILABLE: "A selected photo is held or has lost its content.",
    };
    for (const [reason, text] of Object.entries(reasons)) {
      const state = submitPanelState(view({ submissionUnavailableReason: reason }));
      expect(state.kind).toBe("unavailable");
      expect(state.kind === "unavailable" && t(state.text)).toBe(text);
    }
  });

  it("gateTextKey_eachOfTheSeven_hasItsText: every value of the contract's enum has its own text, never the general one", () => {
    const seven: Record<NonNullable<ChecklistReadiness["submissionUnavailableReason"]>, true> = {
      EVIDENCE_NOT_AVAILABLE: true,
      SUBMISSION_NOT_AVAILABLE: true,
      APPOINTMENT_SCHEDULED: true,
      MISSING_ITEMS: true,
      PHOTOS_NOT_FINISHED: true,
      PHOTO_LIMIT: true,
      PHOTO_UNAVAILABLE: true,
    };
    for (const reason of Object.keys(seven)) expect(gateTextKey(reason)).toBe(`checklist.submit.gate.${reason}`);
  });

  it("has a text for a reason this UI does not know, and for none", () => {
    expect(gateTextKey("SOMETHING_NEW")).toBe("checklist.submit.gate.UNKNOWN");
    expect(gateTextKey(undefined)).toBe("checklist.submit.gate.UNKNOWN");
    expect(gateTextKey("toString")).toBe("checklist.submit.gate.UNKNOWN");
  });

  it("is hidden for a viewer who cannot edit and on a revision that left DRAFT", () => {
    expect(submitPanelState(view({ submissionAvailable: true }, { editable: false, readOnlyReason: "NOT_ASSIGNEE" }))).toEqual({
      kind: "hidden",
    });
    expect(submitPanelState(view({ submissionAvailable: true }, { status: "SUBMITTED" }))).toEqual({ kind: "hidden" });
  });
});

describe("createInFlightGuard (Review Focus 1: a double click sends one submit)", () => {
  it("submitPanel_secondClickWhileSubmitting_isIgnored", async () => {
    const guard = createInFlightGuard();
    let calls = 0;
    let finish: () => void = () => undefined;
    const send = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        finish = () => resolve("sent");
      });
    };
    const first = guard.run(send);
    const second = guard.run(send);
    expect(await second).toBeNull();
    expect(calls).toBe(1);
    finish();
    expect(await first).toBe("sent");
  });

  it("opens again after the answer, also after a failure", async () => {
    const guard = createInFlightGuard();
    await expect(guard.run(() => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await guard.run(() => Promise.resolve("again"))).toBe("again");
  });
});

describe("submitFailureStep (spec 7.3: by code and field)", () => {
  it("lists every failing gate of a 409 and reads again", () => {
    expect(
      submitFailureStep({ kind: "not-ready", gates: ["MISSING_ITEMS", "PHOTOS_NOT_FINISHED"], correlationId: "c-1" }),
    ).toEqual({
      kind: "message",
      texts: ["checklist.submit.gate.MISSING_ITEMS", "checklist.submit.gate.PHOTOS_NOT_FINISHED"],
      reload: true,
      correlationId: "c-1",
    });
  });

  it("keeps one general text when a 409 names no gate this UI knows", () => {
    expect(submitFailureStep({ kind: "not-ready", gates: [] })).toEqual({
      kind: "message",
      texts: ["checklist.submit.gate.UNKNOWN"],
      reload: true,
    });
  });

  it("says when uploads or submission are off, and reads again", () => {
    expect(submitFailureStep({ kind: "submission-not-available" })).toEqual({
      kind: "message",
      texts: ["checklist.submit.gate.SUBMISSION_NOT_AVAILABLE"],
      reload: true,
    });
  });

  it("reads again after a conflict; a failed answer can be sent again (A-4 replays)", () => {
    expect(submitFailureStep({ kind: "stale" })).toEqual({ kind: "message", texts: ["checklist.submit.errors.stale"], reload: true });
    expect(submitFailureStep({ kind: "retry", correlationId: "c-2" })).toEqual({
      kind: "message",
      texts: ["checklist.submit.errors.failed"],
      reload: false,
      correlationId: "c-2",
    });
  });

  it("leaves the answers of the page to the page", () => {
    for (const kind of ["not-found", "signed-out", "unavailable", "forbidden", "read-only", "takeover-required", "surveyor-ineligible"] as const) {
      expect(submitFailureStep({ kind })).toEqual({ kind: "page" });
    }
  });
});
