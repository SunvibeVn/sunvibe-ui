import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { OwnerLeadsKey } from "@/features/lead-shared";
import en from "@/i18n/messages/en.json";

import type { MediaUiError, MediaUiErrorKind } from "../media-ui-error";
import { coverageStateText, deselectErrorText, mediaErrorText } from "./media-messages";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);
const text = (kind: MediaUiErrorKind, extra: Partial<MediaUiError> = {}) => mediaErrorText({ kind, ...extra }, t);

describe("deselectErrorText (survey-checklist submission handoff 2: 429 only on a repeat that changed nothing)", () => {
  it("does not speak of photo views for the budget of a deselection", () => {
    expect(deselectErrorText({ kind: "rate-budget", minutes: 3 }, t)).toBe("Too many tries on this photo. Try again in 3 minutes.");
  });

  it("uses the photo texts for everything else", () => {
    expect(deselectErrorText({ kind: "stale" }, t)).toBe(mediaErrorText({ kind: "stale" }, t));
    expect(deselectErrorText({ kind: "retry" }, t)).toBe(mediaErrorText({ kind: "retry" }, t));
  });
});

describe("the words of a carried photo (spec 6.1)", () => {
  it("names the revision and the action", () => {
    expect(t("checklist.media.carried.from", { no: 1 })).toBe("From revision #1");
    expect(t("checklist.media.carried.remove")).toBe("Remove from this revision");
    expect(t("checklist.media.carried.text", { from: 1 })).toBe(
      "The photo leaves this revision only. It stays in revision #1 and its file is kept.",
    );
  });
});

describe("SV-072, SM-FE-11: the size message and the coverage words", () => {
  it("tooLarge_namesTheLimitOfTheLatestList (spec 6.2 as amended by C-15)", () => {
    expect(mediaErrorText({ kind: "too-large" }, t, { maxFileBytes: 10_485_760 })).toBe("This file is larger than 10 MB.");
    expect(mediaErrorText({ kind: "too-large" }, t, { maxFileBytes: 2_411_724 })).toBe("This file is larger than 2.3 MB.");
  });

  it("tooLarge_withoutALimitFromAList_keepsTheSpec63Text", () => {
    expect(mediaErrorText({ kind: "too-large" }, t, { maxFileBytes: null })).toBe("This file is larger than 20 MB.");
    expect(mediaErrorText({ kind: "too-large" }, t)).toBe("This file is larger than 20 MB.");
  });

  it("notRequired_withoutAReason_saysNotRequiredAlone", () => {
    const row = { state: "NOT_REQUIRED" as const, readyCount: 0, notRequiredReason: null };
    expect(coverageStateText(row, false, t)).toBe("Not required");
    expect(coverageStateText({ ...row, notRequiredReason: "  " }, false, t)).toBe("Not required");
    expect(coverageStateText({ ...row, notRequiredReason: "No kitchen" }, false, t)).toBe("Not required: No kitchen");
  });

  it("coverage_otherStates", () => {
    expect(coverageStateText({ state: "COVERED", readyCount: 2, notRequiredReason: null }, false, t)).toBe("Ready (2)");
    expect(coverageStateText({ state: "PROCESSING", readyCount: 0, notRequiredReason: null }, false, t)).toBe("Processing");
    expect(coverageStateText({ state: "MISSING", readyCount: 0, notRequiredReason: null }, false, t)).toBe("Missing");
    expect(coverageStateText({ state: "OPTIONAL", readyCount: 1, notRequiredReason: null }, true, t)).toBe("1 ready");
  });

  it("theUploadRowLabel_carriesTheSizeUnit", () => {
    expect(t("checklist.media.rows.label", { pair: "Asset (whole property) · Detail", size: "2.3" })).toBe(
      "Asset (whole property) · Detail · 2.3 MB",
    );
  });
});

describe("mediaErrorText (survey-media spec 6.3 texts)", () => {
  it("uses the spec 6.3 wording", () => {
    expect(text("upload-disabled")).toBe("Photo upload is not available yet.");
    expect(text("intake-paused")).toBe("Photo upload is paused. Try again later.");
    expect(text("limit-selected")).toBe("This checklist already has 100 photos. Remove some first.");
    expect(text("rate-uploads", { minutes: 10 })).toBe("Too many uploads. Try again in 10 minutes.");
    expect(text("rate-uploads", { minutes: 1 })).toBe("Too many uploads. Try again in 1 minute.");
    expect(text("rate-expensive")).toBe("Too many files could not be processed. Try again later.");
    expect(text("rate-budget", { minutes: 30 })).toBe("Too many photo views. Try again in 30 minutes.");
    expect(text("serving-disabled")).toBe("Photos are temporarily unavailable.");
    expect(text("too-large")).toBe("This file is larger than 20 MB.");
    expect(text("duplicate")).toBe("This photo is already in the checklist.");
    expect(text("other-visit")).toBe("This photo belongs to another visit of this lead.");
  });

  it("words the other outcomes without server text", () => {
    expect(text("referenced")).toBe("This photo cannot be removed.");
    expect(text("not-available")).toBe("This photo cannot be shown.");
    expect(text("busy")).toBe("The photo service is busy. The upload will be tried again later.");
    expect(text("upload-again")).toBe("This upload can no longer be finished. Upload the photo again.");
    expect(text("in-progress")).toBe("This photo is still being uploaded. Please wait.");
    expect(text("malformed")).toBe("The file could not be sent as it was chosen. Upload it again.");
    expect(text("state-unknown")).toBe("The connection was lost. Checking whether the photo arrived…");
    expect(text("validation")).toBe("Some details are not valid. Please check them.");
    expect(text("stale")).toBe("The photos changed meanwhile. They have been reloaded.");
    expect(text("retry")).toBe("Something went wrong. Please try again.");
  });

  it("keeps the W16 checklist texts for the checklist codes", () => {
    expect(text("forbidden")).toBe("Only the lead's assignee edits the checklist.");
    expect(text("read-only")).toBe("The checklist is read-only now. It has been reloaded.");
    expect(text("takeover-required")).toBe("You are the new assignee. Take over this draft before editing.");
    expect(text("surveyor-ineligible")).toBe("The assignee can no longer take leads. Reassign the lead first.");
  });

  it("shows nothing for what the page answers itself or retries silently", () => {
    for (const kind of [
      "signed-out",
      "unavailable",
      "not-found",
      "aborted",
      "rate-concurrency",
      "limit-pending",
      "rate-bodies",
      "already-received",
      "correction-required",
    ] as const) {
      expect(text(kind)).toBeNull();
    }
  });
});
