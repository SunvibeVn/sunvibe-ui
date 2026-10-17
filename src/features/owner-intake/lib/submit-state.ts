import type { Countdown } from "./countdown";
import type { SubmitOutcome } from "./submit-outcome";

type ErrorOutcome = Extract<SubmitOutcome, { kind: "error" }>;

/** State of the form container's useActionState; "submitting" is its `pending` flag. */
export type SubmitState =
  /** The form; `outcome` holds the messages of the last attempt, `wait` the 429 countdown. */
  | { status: "editing"; outcome?: ErrorOutcome; wait?: Countdown }
  /** The success screen (also for a replay). */
  | { status: "sent"; requestCode: string };

export const INITIAL_SUBMIT_STATE: SubmitState = { status: "editing" };

/** The state after one submit; a 429 starts its Retry-After wait at `now` (epoch ms). */
export function submitStateAfter(outcome: SubmitOutcome, now: number): SubmitState {
  if (outcome.kind === "success") return { status: "sent", requestCode: outcome.requestCode };
  const seconds = outcome.retryAfterSeconds ?? 0;
  return seconds > 0 ? { status: "editing", outcome, wait: { startedAt: now, seconds } } : { status: "editing", outcome };
}

/** What can hold a submit back; the form checks it on submit and disables the button with it. */
export type SubmitGuard = {
  /** A request is in flight (set synchronously, before React renders `pending`). */
  inFlight: boolean;
  /** A ward can be chosen (catalog loaded). */
  catalogReady: boolean;
  /** Seconds left of the 429 wait. */
  waitLeft: number;
  /** "Dùng vị trí hiện tại" is waiting for the browser: its pin must land before the body is built. */
  locating: boolean;
};

export function canSubmit({ inFlight, catalogReady, waitLeft, locating }: SubmitGuard): boolean {
  return !inFlight && catalogReady && waitLeft <= 0 && !locating;
}
