import type { IntakeOwnerState, OwnerRequestIssued } from "../types";

import type { IntakeKey } from "./labels";

// The owner step (property-create intake 4.6, U-2). The code exists in this state only: it is shown once, in the memory of
// the page, and never reaches storage, a URL, a log or a draft. The page says nothing that tells a known address from an
// unknown one, because the answer is the same for both (BR-5, D5-5), and it reads a decline or a void as waiting.

export type OwnerCodeState = { kind: "none" } | { kind: "shown"; code: string; expiresAt: string | null };

export const NO_CODE: OwnerCodeState = { kind: "none" };

/** What the page holds after a request; only the code and its end date. */
export function codeIssued(answer: OwnerRequestIssued): OwnerCodeState {
  return answer.code ? { kind: "shown", code: answer.code, expiresAt: answer.expiresAt ?? null } : NO_CODE;
}

const OWNER_STATE_KEY: Record<IntakeOwnerState, IntakeKey> = {
  NONE: "owner.state.NONE",
  WAITING: "owner.state.WAITING",
  CONFIRMED: "owner.state.CONFIRMED",
};

export function ownerStateKey(state: IntakeOwnerState | undefined): IntakeKey {
  return OWNER_STATE_KEY[state ?? "NONE"];
}

export const OWNER_EMAIL_MAX = 320;

/** The shape of the address only; anything more is the server's, which answers the same for every value. */
export function ownerEmailProblem(value: string): "required" | "invalid" | null {
  const email = value.trim();
  if (email === "") return "required";
  const at = email.indexOf("@");
  return at <= 0 || at === email.length - 1 || email.length > OWNER_EMAIL_MAX ? "invalid" : null;
}
