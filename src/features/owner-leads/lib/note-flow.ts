import type { ApiResult } from "@/features/auth/client";

import { addNote, type AddNoteInput } from "../services/owner-leads-api";
import type { LeadNoteResult } from "../types";

import { localInputToInstant } from "./format";
import { toLeadUiError, withCorrelation } from "./lead-ui-error";
import { noteProblem, type NoteProblem } from "./note-length";

export type NoteFlowDeps = {
  addNote(leadId: string, input: AddNoteInput): Promise<ApiResult<LeadNoteResult>>;
};

const DEFAULT_DEPS: NoteFlowDeps = { addNote: (leadId, input) => addNote(leadId, input) };

/** What happened to a submitted note; the form maps each kind to a message and an action (spec 5.2). */
export type NoteOutcome =
  /** Checked here, nothing was sent. */
  | { kind: "invalid"; note?: NoteProblem; nextAction?: "invalid" }
  /** 201: the page takes `result` (C-36). */
  | { kind: "saved"; result: LeadNoteResult }
  /** 409 `INVALID_STATE_TRANSITION`: the lead was closed meanwhile; reload, keep the text (W11-36). */
  | { kind: "closed"; correlationId?: string }
  /** Any other 409 (`CONCURRENT_MODIFICATION`): reload, keep the draft. */
  | { kind: "stale"; correlationId?: string }
  /** 404: the lead is gone for this user; back to the list with the notice (C-37). */
  | { kind: "gone" }
  /** 403: the forbidden notice in place (spec 5.2, E-2); the text stays in the draft. */
  | { kind: "forbidden"; correlationId?: string }
  /** 400: the server rejected these fields (none named: a general message). */
  | { kind: "rejected"; note?: true; nextAction?: true; correlationId?: string }
  /** Network, 5xx, 429, unavailable or signed-out session, anything else: message with retry, draft kept. */
  | { kind: "failed"; correlationId?: string };

type Input = { leadId: string; note: string; nextAction: string };

/**
 * Checks and sends one note. The next action is the `datetime-local` value (Vietnam time); empty means "keep the
 * current one" and is not sent. Never throws.
 */
export async function submitNote(input: Input, deps: NoteFlowDeps = DEFAULT_DEPS): Promise<NoteOutcome> {
  const noteError = noteProblem(input.note);
  let nextActionAt: string | undefined;
  let nextActionError = false;
  if (input.nextAction !== "") {
    try {
      nextActionAt = localInputToInstant(input.nextAction);
    } catch {
      nextActionError = true;
    }
  }
  if (noteError !== null || nextActionError) {
    return {
      kind: "invalid",
      ...(noteError !== null && { note: noteError }),
      ...(nextActionError && { nextAction: "invalid" as const }),
    };
  }

  const body: AddNoteInput = { note: input.note.trim() };
  if (nextActionAt !== undefined) body.nextActionAt = nextActionAt;

  const result = await deps.addNote(input.leadId, body);
  const error = toLeadUiError(result);
  if (error === null && result.ok) return { kind: "saved", result: result.data };

  const correlationId = error?.correlationId;
  switch (error?.kind) {
    case "not-found":
      return { kind: "gone" };
    case "forbidden":
      return withCorrelation({ kind: "forbidden" }, correlationId);
    case "invalid-transition":
      return withCorrelation({ kind: "closed" }, correlationId);
    case "stale":
      return withCorrelation({ kind: "stale" }, correlationId);
    case "validation": {
      const fields = error.fieldErrors ?? {};
      return withCorrelation(
        {
          kind: "rejected",
          ...(Object.hasOwn(fields, "note") && { note: true as const }),
          ...(Object.hasOwn(fields, "nextActionAt") && { nextAction: true as const }),
        },
        correlationId,
      );
    }
    default:
      return withCorrelation({ kind: "failed" }, correlationId);
  }
}
