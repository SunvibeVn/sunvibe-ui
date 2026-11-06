import type { ApiResult } from "@/features/auth/client";

import { type IntakeUiError, type IntakeUiErrorKind, toIntakeUiError } from "../services/intake-api";

import type { IntakeKey } from "./labels";

// One staff command of the intake page, with its calls injected. Every step of the page and every manager panel goes
// through here, so a refusal means the same everywhere.

export type IntakeMessage = { key: IntakeKey; correlationId?: string };

export type CommandFailure =
  /** The session screens answer. */
  | { kind: "session" }
  /** 404: the lead or the intake is gone for this user. */
  | { kind: "leave" }
  /** The server refused these fields; the form stays. */
  | { kind: "fields"; fields: readonly string[] }
  | { kind: "message"; message: IntakeMessage; reload: boolean };

export type CommandStep<T> = { kind: "done"; data: T } | CommandFailure;

/** What a form shows after its command. */
export type CommandState = { message: IntakeMessage | null; fields: readonly string[] };

export const COMMAND_IDLE: CommandState = { message: null, fields: [] };

/** Refusals with nothing new to read: the form stays as it is, for the user to correct or wait. */
const KEEPS_THE_PAGE: ReadonlySet<IntakeUiErrorKind> = new Set(["validation", "link-invalid", "request-limit", "rate-limited"]);

const messageOf = (error: IntakeUiError): IntakeMessage => {
  const key = `errors.${error.kind}` as IntakeKey;
  return error.correlationId === undefined ? { key } : { key, correlationId: error.correlationId };
};

/**
 * What the page does with a failed command. A conflict, a refusal of the assignee, a 5xx and a lost answer read the block
 * again: the state moved, or the command may have committed before its answer was built (spec 5.3).
 */
export function commandFailure(result: ApiResult<unknown>): CommandFailure {
  const error = toIntakeUiError(result) ?? { kind: "retry" as const };
  if (error.kind === "signed-out" || error.kind === "unavailable") return { kind: "session" };
  if (error.kind === "not-found") return { kind: "leave" };
  if (error.kind === "validation" && (error.fields ?? []).length > 0) return { kind: "fields", fields: error.fields ?? [] };
  return { kind: "message", message: messageOf(error), reload: !KEEPS_THE_PAGE.has(error.kind) };
}

type CommandDeps<T> = {
  send(): Promise<ApiResult<T>>;
  /** Reads the block again. */
  reload(): Promise<unknown>;
};

/** Sends one command and reads the block where its answer calls for it. Never throws. */
export async function runCommand<T>({ send, reload }: CommandDeps<T>): Promise<CommandStep<T>> {
  const result = await send();
  if (result.ok) return { kind: "done", data: result.data };
  const step = commandFailure(result);
  if (step.kind === "message" && step.reload) await reload();
  return step;
}

/**
 * Where the answer of a command shows. A refusal that reads the block goes to the page: the read can take the step that
 * asked away, and with it anything the step would have said. Any other refusal stays in its form.
 */
export function commandOutcome<T>(step: CommandStep<T>): { state: CommandState; notice: IntakeMessage | null } {
  if (step.kind === "fields") return { state: { message: { key: "errors.validation" }, fields: step.fields }, notice: null };
  if (step.kind !== "message") return { state: COMMAND_IDLE, notice: null };
  return step.reload ? { state: COMMAND_IDLE, notice: step.message } : { state: { message: step.message, fields: [] }, notice: null };
}
