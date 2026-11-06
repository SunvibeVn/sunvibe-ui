import { z } from "zod";
import type { ApiResult } from "@/features/auth/client";
import { vietnamDate } from "@/lib/format/vietnam-time";

import {
  addProblem,
  basisDateProblem,
  cleanText,
  crossChecks,
  problemsOf,
  requiredText,
  type SurveyProblems,
} from "../../schemas/survey/survey-text";
import type {
  ChecklistRequalificationInput,
  ChecklistRequalificationKind,
  ChecklistRequalified,
  SurveyBlock,
} from "../../types";
import { REQUALIFICATION_KIND_LABEL } from "../checklist/label-text";
import { toSurveyUiError } from "../survey-ui-error";
import { surveyFailure, type SurveyFailureStep } from "./survey-failure";

// The requalify dialog of the Survey section (property-create requalification spec 6, A-6): its checks, its body and the
// flow of one command, with the calls injected. The text stays on the revision: never in History, a toast, a title, a
// URL, a log or browser storage (`survey BR-4`).

export const REQUALIFY_REASON_MAX = 2000;
export const REQUALIFY_TEXT_MAX = 500;

/** The texts as typed; `basisDate` is the day the source confirmed the problem (`yyyy-MM-dd`, Vietnam). */
export type RequalifyForm = { reasonKind: string; reason: string; eventSource: string; scope: string; basisDate: string };

export const REQUALIFY_DEFAULTS: RequalifyForm = { reasonKind: "", reason: "", eventSource: "", scope: "", basisDate: "" };

export type RequalifyField = keyof RequalifyForm | "confirmed";

/** The fields in the order of the dialog. */
const FIELD_ORDER: readonly RequalifyField[] = ["reasonKind", "reason", "eventSource", "scope", "basisDate", "confirmed"];

/** The field that takes focus after a refusal: the submit sits in the footer of a tall dialog. Null without a problem. */
export function firstRequalifyField(problems: SurveyProblems<RequalifyField>): RequalifyField | null {
  return FIELD_ORDER.find((field) => problems[field] !== undefined) ?? null;
}

/** What the block allows the viewer to mark. */
export type RequalifyTarget = { checklistId: string; expectedVersion: number };

/**
 * The target of a dialog opened for the revision `opened`: its text was written about that revision, and a mark cannot be
 * undone, so a reload that names another revision leaves nothing to send. The version is always the block's latest.
 */
export function openedTarget(target: RequalifyTarget | null, opened: string): RequalifyTarget | null {
  return target?.checklistId === opened ? target : null;
}

/**
 * The tick confirms one consequence, and a mark cannot be undone: `tickedFor` is whether the lead was held when the box
 * was ticked, null while it is not ticked. A reload that changes what the mark does asks for the confirmation again.
 */
export const tickStands = (tickedFor: boolean | null, held: boolean): boolean => tickedFor === held;

/** The action is offered only where the block says so: the UI never derives it from roles (handoff 3). */
export function requalifyTarget(block: Pick<NonNullable<SurveyBlock>, "survey">): RequalifyTarget | null {
  const state = block.survey?.requalification;
  if (state?.allowed !== true || !state.checklistId || typeof state.expectedVersion !== "number") return null;
  return { checklistId: state.checklistId, expectedVersion: state.expectedVersion };
}

const isKind = (value: string): value is ChecklistRequalificationKind => Object.hasOwn(REQUALIFICATION_KIND_LABEL, value);

/** Required text without a phone number or U+0000 (SV-087). */
const markText = (max: number) => requiredText(max).refine((value) => !value.includes("\u0000"), { error: "invalid" });

/**
 * Checks the dialog (A-6): a known kind, the three texts, a date not after today in Vietnam and the confirmation. The
 * server checks the date against the decision day, which the block does not name. `{}` when valid.
 */
export function validateRequalify(form: RequalifyForm, ctx: { now: number; confirmed: boolean }): SurveyProblems<RequalifyField> {
  const texts = z.object({
    reason: markText(REQUALIFY_REASON_MAX),
    eventSource: markText(REQUALIFY_TEXT_MAX),
    scope: markText(REQUALIFY_TEXT_MAX),
  });
  const rest = crossChecks((refine) => {
    if (form.reasonKind === "") addProblem(refine, "reasonKind", "required");
    else if (!isKind(form.reasonKind)) addProblem(refine, "reasonKind", "invalid");
    const date = basisDateProblem(form.basisDate, vietnamDate(new Date(ctx.now).toISOString()));
    if (date !== null) addProblem(refine, "basisDate", date);
    if (!ctx.confirmed) addProblem(refine, "confirmed", "required");
  });
  return problemsOf<RequalifyField>(texts.safeParse(form), rest);
}

/** The body of a checked form, every key present. */
export function toRequalifyBody(form: RequalifyForm, ctx: { expectedVersion: number }): ChecklistRequalificationInput {
  return {
    expectedVersion: ctx.expectedVersion,
    reasonKind: form.reasonKind as ChecklistRequalificationKind,
    reason: cleanText(form.reason),
    eventSource: cleanText(form.eventSource),
    scope: cleanText(form.scope),
    basisDate: form.basisDate,
  };
}

const API_FIELDS: Readonly<Record<string, RequalifyField>> = {
  reasonKind: "reasonKind",
  reason: "reason",
  eventSource: "eventSource",
  scope: "scope",
  basisDate: "basisDate",
};

/** What the dialog does with a refused command, by its code (handoff 2, 4); a conflict keeps the form and reloads. */
export function requalifyFailure(result: ApiResult<unknown>): SurveyFailureStep<RequalifyField> {
  const error = toSurveyUiError(result) ?? { kind: "retry" as const };
  const step = surveyFailure(error, API_FIELDS);
  // The mark commits before its answer is built (spec 5.3): after a 5xx or a lost answer the page reads what stands.
  if (step.kind === "message" && error.kind === "retry") return { ...step, reload: true };
  // The date passed the checks here, so what the server still refuses is a day before the decision (A-6).
  if (step.kind === "fields" && step.problems.basisDate === "invalid") {
    return { kind: "fields", problems: { ...step.problems, basisDate: "tooEarly" } };
  }
  return step;
}

export type RequalifyStep = { kind: "saved" } | SurveyFailureStep<RequalifyField>;

type RequalifyDeps = {
  send(): Promise<ApiResult<ChecklistRequalified>>;
  /** Forgets the sent text; only after a mark. */
  clear(): void;
  /** Reads the lead, its History and the survey block again (it waits for the lead only): the answer is not a `SurveyCommandResult`. */
  reload(): Promise<unknown>;
};

/** Sends one requalification and reads the page again where its answer calls for it. Never throws. */
export async function runRequalify({ send, clear, reload }: RequalifyDeps): Promise<RequalifyStep> {
  const result = await send();
  if (result.ok) {
    await reload();
    clear();
    return { kind: "saved" };
  }
  const step = requalifyFailure(result);
  if (step.kind === "message" && step.reload) await reload();
  return step;
}

/** One submit at a time and none after a mark: the repeat of a double click sends nothing (Review Focus 1). */
export type SubmitGate = {
  /** True when this submit may go on; it then holds the gate until `leave`. */
  enter(): boolean;
  leave(saved: boolean): void;
};

export function createSubmitGate(): SubmitGate {
  let state: "open" | "sending" | "saved" = "open";
  return {
    enter() {
      if (state !== "open") return false;
      state = "sending";
      return true;
    },
    leave(saved) {
      state = saved ? "saved" : "open";
    },
  };
}
