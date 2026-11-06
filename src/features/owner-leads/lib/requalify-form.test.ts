import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import type { OwnerLeadsKey } from "@/features/lead-shared";
import { readFormDraft, writeFormDraft } from "@/features/lead-shared/client";
import type { ChecklistRequalified } from "@/features/surveys";
import en from "@/i18n/messages/en.json";

import { problemText } from "../components/survey/survey-copy";

import {
  createSubmitGate,
  firstRequalifyField,
  openedTarget,
  REQUALIFY_DEFAULTS,
  REQUALIFY_REASON_MAX,
  REQUALIFY_TEXT_MAX,
  requalifyFailure,
  type RequalifyForm,
  requalifyTarget,
  runRequalify,
  tickStands,
  toRequalifyBody,
  validateRequalify,
} from "./requalify-form";

const FORM: RequalifyForm = {
  reasonKind: "WRONG_ASSET",
  reason: "The survey was of the neighbouring unit",
  eventSource: "Owner phone call",
  scope: "The whole survey",
  basisDate: "2026-11-05",
};

const NOON = Date.parse("2026-11-05T05:00:00Z");
const checked = (form: Partial<RequalifyForm>, confirmed = true) =>
  validateRequalify({ ...FORM, ...form }, { now: NOON, confirmed });

type Failure = ApiResult<ChecklistRequalified>;

const refused = (status: number, code: string, field?: string): Failure => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: field === undefined ? [] : [{ field, message: "server words" }],
  correlationId: "corr-1",
});

describe("validateRequalify (spec A-6)", () => {
  it("form_required: asks for every field and the confirmation", () => {
    expect(
      validateRequalify({ reasonKind: "", reason: "  ", eventSource: "", scope: "", basisDate: "" }, { now: NOON, confirmed: false }),
    ).toEqual({
      reasonKind: "required",
      reason: "required",
      eventSource: "required",
      scope: "required",
      basisDate: "required",
      confirmed: "required",
    });
    expect(checked({})).toEqual({});
  });

  it("refuses a kind the contract does not name", () => {
    expect(checked({ reasonKind: "SOMETHING_ELSE" })).toEqual({ reasonKind: "invalid" });
  });

  it("form_limits: 1..2000 for the reason, 1..500 for source and scope, counted on the trimmed text", () => {
    expect(REQUALIFY_REASON_MAX).toBe(2000);
    expect(REQUALIFY_TEXT_MAX).toBe(500);
    expect(checked({ reason: "a".repeat(2000), eventSource: "b".repeat(500), scope: "c".repeat(500) })).toEqual({});
    expect(checked({ reason: `  ${"a".repeat(2000)}  ` })).toEqual({});
    expect(checked({ reason: "a".repeat(2001), eventSource: "b".repeat(501), scope: "c".repeat(501) })).toEqual({
      reason: "tooLong",
      eventSource: "tooLong",
      scope: "tooLong",
    });
  });

  it("form_limits: refuses a phone number in any text (survey BR-4, Review Focus 5)", () => {
    expect(checked({ reason: "Call 0901 234 567", eventSource: "0901234567", scope: "+84 901 234 567" })).toEqual({
      reason: "phone",
      eventSource: "phone",
      scope: "phone",
    });
  });

  it("form_limits: refuses U+0000 (SV-087)", () => {
    expect(checked({ reason: "a\u0000b", eventSource: "\u0000x", scope: "x\u0000" })).toEqual({
      reason: "invalid",
      eventSource: "invalid",
      scope: "invalid",
    });
  });

  it("form_dateNotFuture: the day ends in Vietnam, not at UTC midnight", () => {
    const evening = Date.parse("2026-11-05T18:00:00Z"); // 01:00 on the 6th in Vietnam
    const at = (basisDate: string, now: number) => validateRequalify({ ...FORM, basisDate }, { now, confirmed: true });
    expect(at("2026-11-05", NOON)).toEqual({});
    expect(at("2026-11-06", NOON)).toEqual({ basisDate: "tooLate" });
    expect(at("2026-11-06", evening)).toEqual({});
    expect(at("2026-11-07", evening)).toEqual({ basisDate: "tooLate" });
    expect(at("2026-02-30", NOON)).toEqual({ basisDate: "invalid" });
  });
});

describe("firstRequalifyField (ui-ux-review: focus goes to the first error)", () => {
  it("names the first field with a problem, in the order of the dialog", () => {
    expect(firstRequalifyField({})).toBeNull();
    expect(firstRequalifyField({ confirmed: "required", scope: "tooLong" })).toBe("scope");
    expect(firstRequalifyField({ basisDate: "tooEarly", reason: "phone" })).toBe("reason");
    expect(firstRequalifyField({ confirmed: "required", reasonKind: "required" })).toBe("reasonKind");
  });
});

describe("the dialog belongs to the revision it opened for (a mark cannot be undone)", () => {
  const target = { checklistId: "C2", expectedVersion: 4 };

  it("a draft typed for one revision never fills the dialog of another", () => {
    const text = writeFormDraft(FORM, REQUALIFY_DEFAULTS, "C2");
    expect(readFormDraft(text, REQUALIFY_DEFAULTS, "C2")).toEqual(FORM);
    expect(readFormDraft(text, REQUALIFY_DEFAULTS, "C3")).toEqual(REQUALIFY_DEFAULTS);
  });

  it("sends only to that revision, at the version the block names now", () => {
    expect(openedTarget({ ...target, expectedVersion: 5 }, "C2")).toEqual({ checklistId: "C2", expectedVersion: 5 });
    expect(openedTarget({ checklistId: "C3", expectedVersion: 1 }, "C2")).toBeNull();
    expect(openedTarget(null, "C2")).toBeNull();
  });
});

describe("tickStands (a mark cannot be undone)", () => {
  it("a tick stands only for the consequence it was given for", () => {
    expect(tickStands(null, false)).toBe(false);
    expect(tickStands(null, true)).toBe(false);
    expect(tickStands(false, false)).toBe(true);
    expect(tickStands(true, true)).toBe(true);
    expect(tickStands(false, true)).toBe(false);
    expect(tickStands(true, false)).toBe(false);
  });
});

describe("toRequalifyBody", () => {
  it("sends every key, the text as the server keeps it", () => {
    expect(
      toRequalifyBody({ ...FORM, reason: "  Café ", eventSource: " Owner ", scope: " All " }, { expectedVersion: 4 }),
    ).toEqual({
      expectedVersion: 4,
      reasonKind: "WRONG_ASSET",
      reason: "Café",
      eventSource: "Owner",
      scope: "All",
      basisDate: "2026-11-05",
    });
  });
});

describe("requalifyTarget (spec 7, handoff 3)", () => {
  const block = (requalification: unknown) => ({ survey: { requalification } }) as never;

  it("action_onlyWhenAllowed: names the revision and version the block allows, and nothing else", () => {
    expect(requalifyTarget(block({ allowed: true, checklistId: "C1", expectedVersion: 4 }))).toEqual({
      checklistId: "C1",
      expectedVersion: 4,
    });
    expect(requalifyTarget(block({ allowed: true, checklistId: "C1", expectedVersion: 0 }))).toEqual({
      checklistId: "C1",
      expectedVersion: 0,
    });
    expect(requalifyTarget(block({ allowed: false, checklistId: null, expectedVersion: null }))).toBeNull();
    expect(requalifyTarget(block({ allowed: false, checklistId: "C1", expectedVersion: 4 }))).toBeNull();
    expect(requalifyTarget(block({ allowed: true, checklistId: null, expectedVersion: 4 }))).toBeNull();
    expect(requalifyTarget(block({ allowed: true, checklistId: "C1", expectedVersion: null }))).toBeNull();
    expect(requalifyTarget(block(undefined))).toBeNull();
    expect(requalifyTarget({})).toBeNull();
  });
});

describe("requalifyFailure (handoff 2, 4)", () => {
  it("api_mapsErrorCodes: a 400 shows at the dialog's fields", () => {
    expect(requalifyFailure(refused(400, "VALIDATION_FAILED", "reason"))).toEqual({ kind: "fields", problems: { reason: "invalid" } });
    expect(requalifyFailure(refused(400, "VALIDATION_FAILED", "eventSource"))).toEqual({
      kind: "fields",
      problems: { eventSource: "invalid" },
    });
    expect(requalifyFailure(refused(400, "VALIDATION_FAILED", "scope"))).toEqual({ kind: "fields", problems: { scope: "invalid" } });
    expect(requalifyFailure(refused(400, "VALIDATION_FAILED", "reasonKind"))).toEqual({
      kind: "fields",
      problems: { reasonKind: "invalid" },
    });
  });

  it("api_mapsErrorCodes: a date the checks here let through was refused against the decision day", () => {
    const step = requalifyFailure(refused(400, "VALIDATION_FAILED", "basisDate"));
    expect(step).toEqual({ kind: "fields", problems: { basisDate: "tooEarly" } });
    const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
    const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);
    expect(problemText(t, "tooEarly", "decisionDate")).toBe("The date cannot be before the day of the decision.");
    expect(problemText(t, "tooLate", "decisionDate")).toBe("The date cannot be after today.");
  });

  it("api_mapsErrorCodes: a 400 on anything else is one general message, with its support code", () => {
    expect(requalifyFailure(refused(400, "MALFORMED_REQUEST"))).toEqual({
      kind: "message",
      message: "badRequest",
      reload: false,
      correlationId: "corr-1",
    });
    expect(requalifyFailure(refused(400, "VALIDATION_FAILED", "expectedVersion"))).toMatchObject({
      kind: "message",
      message: "badRequest",
    });
  });

  it("api_mapsErrorCodes: every conflict keeps the dialog and reloads", () => {
    expect(requalifyFailure(refused(409, "CONCURRENT_MODIFICATION", "expectedVersion"))).toMatchObject({
      kind: "message",
      message: "stale",
      reload: true,
    });
    expect(requalifyFailure(refused(409, "SURVEY_NOT_ALLOWED", "checklist"))).toMatchObject({
      kind: "message",
      message: "checklistRefused",
      reload: true,
    });
    expect(requalifyFailure(refused(409, "INVALID_STATE_TRANSITION", "status"))).toMatchObject({
      kind: "message",
      message: "invalidTransition",
      reload: true,
    });
  });

  it("api_mapsErrorCodes: 403 shows its message, 404 leaves, the session answers for itself", () => {
    expect(requalifyFailure(refused(403, "FORBIDDEN"))).toMatchObject({ kind: "message", message: "forbidden", reload: false });
    expect(requalifyFailure(refused(404, "NOT_FOUND"))).toEqual({ kind: "leave" });
    expect(requalifyFailure({ ok: false, kind: "signed-out" })).toEqual({ kind: "session" });
    expect(requalifyFailure({ ok: false, kind: "unavailable" })).toEqual({ kind: "session" });
  });

  it("api_mapsErrorCodes: a 5xx or a lost answer reloads, because the mark commits before its answer (spec 5.3)", () => {
    expect(requalifyFailure(refused(500, "INTERNAL_ERROR"))).toMatchObject({ kind: "message", message: "failed", reload: true });
    expect(requalifyFailure({ ok: false, kind: "network" } as Failure)).toMatchObject({
      kind: "message",
      message: "failed",
      reload: true,
    });
  });
});

describe("runRequalify and the submit gate (Review Focus 1)", () => {
  const saved: Failure = { ok: true, status: 200, data: {} } as Failure;

  it("clears the form and reloads the lead after a mark, because the answer is not a SurveyCommandResult", async () => {
    const reload = vi.fn(async () => true);
    const clear = vi.fn();
    expect(await runRequalify({ send: async () => saved, clear, reload })).toEqual({ kind: "saved" });
    expect(clear).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("guard_secondSubmitWhileSaving_ignored: one submit at a time, and none after a mark", () => {
    const gate = createSubmitGate();
    expect(gate.enter()).toBe(true);
    expect(gate.enter()).toBe(false);
    gate.leave(true);
    expect(gate.enter()).toBe(false);
  });

  it("guard_refusal_keepsValues: a refusal keeps the form, reloads, and lets the same text go again", async () => {
    const gate = createSubmitGate();
    const reload = vi.fn(async () => true);
    const clear = vi.fn();
    expect(gate.enter()).toBe(true);
    const step = await runRequalify({
      send: async () => refused(409, "CONCURRENT_MODIFICATION", "expectedVersion"),
      clear,
      reload,
    });
    gate.leave(step.kind === "saved");
    expect(step).toMatchObject({ kind: "message", message: "stale" });
    expect(clear).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
    expect(gate.enter()).toBe(true);
  });

  it("a field refusal neither clears nor reloads", async () => {
    const reload = vi.fn(async () => true);
    const clear = vi.fn();
    await runRequalify({ send: async () => refused(400, "VALIDATION_FAILED", "reason"), clear, reload });
    expect(clear).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
