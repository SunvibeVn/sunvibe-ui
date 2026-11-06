import type { ApiResult } from "@/features/auth/client";

import { toConfirmationUiError } from "../services/confirmations-api";
import type { OwnerConfirmationList, OwnerConfirmationSnapshot } from "../types";

import type { IntakeKey } from "./labels";

// `/account/property-confirmations` (property-create intake 6.2, D5-6, D5-7, D5-8). Everything lives in the page's memory:
// a reload starts over, and no code, phrase, password or address reaches storage, a URL or a log. Before the code the
// account sees only that a request exists and when it ends. The page asks for the phrase the caller reads out; it never
// has one to show.

export type ConfirmationItemView =
  | { kind: "pending"; requestId: string; expiresAt: string | null }
  | {
      kind: "confirmed";
      requestId: string;
      expiresAt: string | null;
      details: OwnerConfirmationSnapshot | null;
      /** A check is open: the page asks for the phrase. */
      asksForPhrase: boolean;
    };

/** The requests of this account, with nothing a state does not allow. */
export function confirmationItems(list: OwnerConfirmationList): ConfirmationItemView[] {
  return (list.items ?? []).flatMap((item): ConfirmationItemView[] => {
    if (!item.requestId) return [];
    const base = { requestId: item.requestId, expiresAt: item.expiresAt ?? null };
    if (item.status !== "CONFIRMED") return [{ kind: "pending", ...base }];
    return [{ kind: "confirmed", ...base, details: item.details ?? null, asksForPhrase: item.checkOpen === true }];
  });
}

export type ConfirmationMessage = { key: IntakeKey; correlationId?: string };

export type ConfirmationStep<T> =
  | { kind: "done"; data: T }
  /** The account changed while the call was on its way: nothing of the answer shows (auth U-8). */
  | { kind: "dropped" }
  /** The session screens answer. */
  | { kind: "session" }
  /** The password was refused: a problem of its field. */
  | { kind: "password"; key: IntakeKey }
  | { kind: "message"; message: ConfirmationMessage; reload: boolean };

const MESSAGE_KEY = {
  invalid: "account.errors.invalid",
  locked: "account.errors.locked",
  "rate-limited": "account.errors.rateLimited",
  stale: "account.errors.stale",
  gone: "account.errors.gone",
  retry: "account.errors.retry",
} as const satisfies Record<string, IntakeKey>;

/** The list moved, or the command may have committed before its answer was built: the page reads it again. */
const READS_THE_LIST: ReadonlySet<string> = new Set(["stale", "gone", "retry"]);

type ConfirmationDeps<T> = {
  send(): Promise<ApiResult<T>>;
  /** The account that made the call is still the one signed in. */
  isCurrent(): boolean;
};

/** Sends one owner call. Never throws. */
export async function runConfirmation<T>({ send, isCurrent }: ConfirmationDeps<T>): Promise<ConfirmationStep<T>> {
  const result = await send();
  if (!isCurrent()) return { kind: "dropped" };
  if (result.ok) return { kind: "done", data: result.data };
  const error = toConfirmationUiError(result) ?? { kind: "retry" as const };
  if (error.kind === "signed-out" || error.kind === "unavailable") return { kind: "session" };
  if (error.kind === "wrong-password") return { kind: "password", key: "account.problems.wrongPassword" };
  const key = MESSAGE_KEY[error.kind];
  const message = error.correlationId === undefined ? { key } : { key, correlationId: error.correlationId };
  return { kind: "message", message, reload: READS_THE_LIST.has(error.kind) };
}

/**
 * The details form closes when the list moved, and after a refused code: that code opened these details moments ago, so
 * the request has ended and its address does not stay on screen.
 */
export function closesDetails<T>(step: ConfirmationStep<T>): boolean {
  return step.kind === "message" && (step.reload || step.message.key === "account.errors.invalid");
}

/** What a form of the page shows after a call. */
export type ConfirmationFormState = { message: ConfirmationMessage | null; passwordProblem: IntakeKey | null };

export const FORM_IDLE: ConfirmationFormState = { message: null, passwordProblem: null };

export function formStateAfter<T>(step: ConfirmationStep<T>): ConfirmationFormState {
  if (step.kind === "message") return { ...FORM_IDLE, message: step.message };
  if (step.kind === "password") return { ...FORM_IDLE, passwordProblem: step.key };
  return FORM_IDLE;
}

/** Both are read out by phone and fit this bound (the contract's). */
const SPOKEN_MAX = 32;

const spokenProblem = (value: string): "required" | "invalid" | null => {
  const text = value.trim();
  if (text === "") return "required";
  return text.length > SPOKEN_MAX ? "invalid" : null;
};

export const codeProblem = spokenProblem;
export const phraseProblem = spokenProblem;

export function passwordProblem(value: string): "required" | null {
  return value === "" ? "required" : null;
}

/** A text field of a submitted form. */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
