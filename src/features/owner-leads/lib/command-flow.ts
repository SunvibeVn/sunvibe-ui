import type { ApiResult } from "@/features/auth/client";

import type { LeadStatus, LeadSummary } from "../types";

import { toLeadUiError, withCorrelation } from "./lead-ui-error";

/** Why an assign or status change did not go through; the dialogs map each kind to a message and an action (5.2). */
export type CommandFailure =
  /**
   * 409 `CONCURRENT_MODIFICATION` (or any 409 but a transition): "Lead vừa được người khác cập nhật", reload, draft
   * kept.
   */
  | { kind: "stale"; correlationId?: string }
  /** 409 `INVALID_STATE_TRANSITION`: message, the statuses allowed now when the API named any, reload. */
  | { kind: "invalid-transition"; allowed?: LeadStatus[]; correlationId?: string }
  /** 422 `INELIGIBLE_ASSIGNEE`: message, the assignee list is loaded again. */
  | { kind: "ineligible"; correlationId?: string }
  /** 400: the API field names (the UI shows its own text per field, a general message when none is known). */
  | { kind: "rejected"; fields: string[]; correlationId?: string }
  /** 403: the forbidden notice; the session stays. */
  | { kind: "forbidden"; correlationId?: string }
  /** 404: the lead is gone for this user; back to the list with the notice (C-37). */
  | { kind: "gone" }
  /** Network, 5xx, 429, or a session that is unavailable or signed out: generic message, retry, draft kept. */
  | { kind: "failed"; correlationId?: string };

export type CommandOutcome = { kind: "saved"; summary: LeadSummary } | CommandFailure;

/** Maps the answer of an assign or a status change (spec 5.2). Never throws. */
export function toCommandOutcome(result: ApiResult<LeadSummary>): CommandOutcome {
  if (result.ok) return { kind: "saved", summary: result.data };
  const error = toLeadUiError(result);
  const correlationId = error?.correlationId;
  switch (error?.kind) {
    case "stale":
      return withCorrelation({ kind: "stale" }, correlationId);
    case "invalid-transition":
      return withCorrelation(
        error.allowed === undefined
          ? { kind: "invalid-transition" }
          : { kind: "invalid-transition", allowed: error.allowed },
        correlationId,
      );
    case "ineligible":
      return withCorrelation({ kind: "ineligible" }, correlationId);
    case "validation":
      return withCorrelation({ kind: "rejected", fields: Object.keys(error.fieldErrors ?? {}) }, correlationId);
    case "forbidden":
      return withCorrelation({ kind: "forbidden" }, correlationId);
    case "not-found":
      return { kind: "gone" };
    default:
      return withCorrelation({ kind: "failed" }, correlationId);
  }
}

/**
 * The last word of a status or assign command, held by the actions slot so it stays visible when the dialog closes
 * (for example after a reload brought another status). Field problems stay at the inputs of the dialog instead.
 */
export type CommandMessage =
  | { kind: "stale" | "ineligible" | "forbidden" | "failed" | "bad-request"; correlationId?: string }
  | { kind: "invalid-transition"; allowed?: LeadStatus[]; correlationId?: string }
  | { kind: "status-saved" | "assigned" };

/**
 * The message for a failure that is not shown at a field (a 400 lands here only when no field of the dialog was
 * named); null for a 404, where the page leaves for the list.
 */
export function failureMessage(failure: CommandFailure): CommandMessage | null {
  if (failure.kind === "gone") return null;
  const support = failure.correlationId === undefined ? {} : { correlationId: failure.correlationId };
  switch (failure.kind) {
    case "rejected":
      return { kind: "bad-request", ...support };
    case "invalid-transition":
      return failure.allowed === undefined
        ? { kind: "invalid-transition", ...support }
        : { kind: "invalid-transition", allowed: failure.allowed, ...support };
    default:
      return { kind: failure.kind, ...support };
  }
}
