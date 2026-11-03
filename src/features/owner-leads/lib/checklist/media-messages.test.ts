import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { MediaUiError, MediaUiErrorKind } from "@/features/surveys";
import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { mediaErrorText } from "./media-messages";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);
const text = (kind: MediaUiErrorKind, extra: Partial<MediaUiError> = {}) => mediaErrorText({ kind, ...extra }, t);

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
