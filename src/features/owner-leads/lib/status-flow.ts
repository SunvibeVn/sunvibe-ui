import type { ApiResult } from "@/features/auth/client";

import { changeStatus, type ChangeStatusInput, findLeadByRequestCode } from "../services/owner-leads-api";
import type { DuplicateCandidate, LeadPage, LeadStatus, LeadSummary } from "../types";

import { type CommandOutcome, toCommandOutcome } from "./command-flow";
import { parseDuplicateInput } from "./duplicate-input";
import { localInputToInstant } from "./format";
import { toLeadUiError } from "./lead-ui-error";
import { NOTE_MAX, utf16Length } from "./note-length";
import { isClosing } from "./transitions";

/** Longest close reason the API takes (lead-queue: reason 1..500). */
export const REASON_MAX = 500;

/** How the original of a DUPLICATE was given (spec 5.4, C-21). */
export type OriginalChoice =
  | { kind: "none" }
  /** One of the lead's possible duplicates. */
  | { kind: "candidate"; id: string }
  /** A pasted request code or workspace lead link. */
  | { kind: "text"; text: string };

/** What the status dialog holds when it is submitted. Texts come from the drafts. */
export type StatusForm = {
  target: LeadStatus | null;
  reason: string;
  note: string;
  /** `datetime-local` value, read as Vietnam time; empty = keep the current next action. */
  nextAction: string;
  original: OriginalChoice;
};

export type OriginalProblem = "required" | "invalid" | "self" | "duplicate" | "not-found";

export type StatusProblems = {
  target?: "required";
  reason?: "required" | "tooLong";
  note?: "tooLong";
  nextAction?: "invalid";
  original?: OriginalProblem;
};

/** The original shown before the confirmation. A pasted link has only the id (no preview, the server decides). */
export type OriginalPreview = { id: string; requestCode?: string; status?: string; createdAt?: string };

/** The status change body without the version, which is added at send time (spec 5.2). */
export type StatusRequest = Omit<ChangeStatusInput, "expectedVersion">;

export type LookupFailure = { kind: "forbidden" | "failed"; correlationId?: string };

export type OriginalResolution =
  | { kind: "found"; original: OriginalPreview }
  | { kind: "problem"; problem: OriginalProblem }
  | { kind: "lookup-failed"; failure: LookupFailure };

export type StatusStep =
  /** Checked here; nothing to send yet. */
  | { kind: "invalid"; problems: StatusProblems }
  /** The request-code lookup failed (403 or a retry case). */
  | { kind: "lookup-failed"; failure: LookupFailure }
  /** A closing target: show the second confirmation "Lead đã đóng không mở lại được", then send. */
  | { kind: "confirm"; request: StatusRequest; original?: OriginalPreview }
  /** A non-closing target: send now. */
  | { kind: "send"; request: StatusRequest };

export type StatusContext = {
  /** The lead being changed: never its own original. */
  leadId: string;
  candidates: readonly DuplicateCandidate[];
  /** "all" for an `ALL` viewer, "mine" otherwise (C-21). */
  scope: "all" | "mine";
};

export type StatusFlowDeps = {
  findLeadByRequestCode(code: string, scope: "all" | "mine"): Promise<ApiResult<LeadPage>>;
  changeStatus(leadId: string, input: ChangeStatusInput): Promise<ApiResult<LeadSummary>>;
};

const DEFAULT_DEPS: StatusFlowDeps = {
  findLeadByRequestCode: (code, scope) => findLeadByRequestCode(code, scope),
  changeStatus: (leadId, input) => changeStatus(leadId, input),
};

const sameId = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

/** Checks an original that needs no call; `lookup` when a request-code lookup must decide. */
function checkOriginalLocally(
  choice: OriginalChoice,
  ctx: StatusContext,
): OriginalResolution | { kind: "lookup"; code: string } {
  switch (choice.kind) {
    case "none":
      return { kind: "problem", problem: "required" };
    case "candidate": {
      const candidate = ctx.candidates.find((entry) => entry.id !== undefined && entry.id === choice.id);
      if (candidate?.id === undefined) return { kind: "problem", problem: "required" };
      if (sameId(candidate.id, ctx.leadId)) return { kind: "problem", problem: "self" };
      if (candidate.status === "DUPLICATE") return { kind: "problem", problem: "duplicate" };
      return { kind: "found", original: previewOf(candidate.id, candidate) };
    }
    case "text": {
      if (choice.text.trim() === "") return { kind: "problem", problem: "required" };
      const parsed = parseDuplicateInput(choice.text);
      if (parsed.kind === "invalid") return { kind: "problem", problem: "invalid" };
      if (parsed.kind === "id") {
        // A link is sent without a preview; only the lead itself is refused here (C-21).
        return sameId(parsed.id, ctx.leadId)
          ? { kind: "problem", problem: "self" }
          : { kind: "found", original: { id: parsed.id } };
      }
      return { kind: "lookup", code: parsed.code };
    }
  }
}

function previewOf(id: string, source: { requestCode?: string; status?: string; createdAt?: string }): OriginalPreview {
  return {
    id,
    ...(source.requestCode !== undefined && { requestCode: source.requestCode }),
    ...(source.status !== undefined && { status: source.status }),
    ...(source.createdAt !== undefined && { createdAt: source.createdAt }),
  };
}

/**
 * Finds the original of a DUPLICATE (C-21): a candidate of the lead, a pasted link (id only) or a request code looked
 * up in the viewer's scope with no status, so a closed original is found too. The lead itself and a lead in
 * `DUPLICATE` are refused; a code that finds nothing is "not-found" ("Không tìm thấy lead này hoặc bạn không xem
 * được").
 */
export async function resolveOriginal(
  choice: OriginalChoice,
  ctx: StatusContext,
  deps: StatusFlowDeps = DEFAULT_DEPS,
): Promise<OriginalResolution> {
  const local = checkOriginalLocally(choice, ctx);
  if (local.kind !== "lookup") return local;

  const result = await deps.findLeadByRequestCode(local.code, ctx.scope);
  if (!result.ok) {
    const error = toLeadUiError(result);
    if (error?.kind === "validation") return { kind: "problem", problem: "invalid" };
    if (error?.kind === "not-found") return { kind: "problem", problem: "not-found" };
    const failure: LookupFailure = { kind: error?.kind === "forbidden" ? "forbidden" : "failed" };
    if (error?.correlationId !== undefined) failure.correlationId = error.correlationId;
    return { kind: "lookup-failed", failure };
  }
  const hit = (result.data.items ?? []).find((item) => item.requestCode?.toUpperCase() === local.code);
  if (hit?.id === undefined) return { kind: "problem", problem: "not-found" };
  if (sameId(hit.id, ctx.leadId)) return { kind: "problem", problem: "self" };
  if (hit.status === "DUPLICATE") return { kind: "problem", problem: "duplicate" };
  return { kind: "found", original: previewOf(hit.id, hit) };
}

/** Missing or unreadable original; the candidate, the lead itself and the hit are checked by `resolveOriginal`. */
function originalShapeProblem(choice: OriginalChoice): "required" | "invalid" | null {
  if (choice.kind === "none") return "required";
  if (choice.kind === "candidate") return null;
  if (choice.text.trim() === "") return "required";
  return parseDuplicateInput(choice.text).kind === "invalid" ? "invalid" : null;
}

/** Field checks that need no call. */
function checkFields(form: StatusForm): StatusProblems {
  const problems: StatusProblems = {};
  if (form.target === null) {
    problems.target = "required";
    return problems;
  }
  if (isClosing(form.target)) {
    if (form.reason.trim() === "") problems.reason = "required";
    else if (utf16Length(form.reason) > REASON_MAX) problems.reason = "tooLong";
    if (form.target === "DUPLICATE") {
      const shape = originalShapeProblem(form.original);
      if (shape !== null) problems.original = shape;
    }
    return problems;
  }
  if (utf16Length(form.note) > NOTE_MAX) problems.note = "tooLong";
  if (form.nextAction !== "") {
    try {
      localInputToInstant(form.nextAction);
    } catch {
      problems.nextAction = "invalid";
    }
  }
  return problems;
}

/**
 * Checks the status dialog and builds what to send (US-6): a non-closing target sends the trimmed note and the next
 * action when given; a closing target sends only the trimmed reason (and the original for DUPLICATE) and asks for a
 * second confirmation first. Every field problem is reported at once; the original is looked up only when the rest
 * is fine. Never throws.
 */
export async function prepareStatusChange(
  form: StatusForm,
  ctx: StatusContext,
  deps: StatusFlowDeps = DEFAULT_DEPS,
): Promise<StatusStep> {
  const problems = checkFields(form);
  const target = form.target;
  if (target === null || Object.keys(problems).length > 0) return { kind: "invalid", problems };

  if (!isClosing(target)) {
    const request: StatusRequest = { toStatus: target };
    const note = form.note.trim();
    if (note !== "") request.note = note;
    if (form.nextAction !== "") request.nextActionAt = localInputToInstant(form.nextAction);
    return { kind: "send", request };
  }

  const request: StatusRequest = { toStatus: target, reason: form.reason.trim() };
  if (target !== "DUPLICATE") return { kind: "confirm", request };

  const resolution = await resolveOriginal(form.original, ctx, deps);
  switch (resolution.kind) {
    case "problem":
      return { kind: "invalid", problems: { original: resolution.problem } };
    case "lookup-failed":
      return { kind: "lookup-failed", failure: resolution.failure };
    case "found":
      return {
        kind: "confirm",
        request: { ...request, duplicateOfLeadId: resolution.original.id },
        original: resolution.original,
      };
  }
}

/** Sends a prepared status change with the version of the last detail or command answer (spec 5.2). */
export async function sendStatusChange(
  leadId: string,
  request: StatusRequest,
  expectedVersion: number,
  deps: StatusFlowDeps = DEFAULT_DEPS,
): Promise<CommandOutcome> {
  return toCommandOutcome(await deps.changeStatus(leadId, { ...request, expectedVersion }));
}
