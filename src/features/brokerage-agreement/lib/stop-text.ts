import type { IntroducedBySunvibe, SuspensionReasonType, TerminationType, WithdrawalChannel } from "../types";

import type { EligibilityKey } from "./reason-text";

// `Record` over each generated union: a code without a text fails `npm run typecheck` (brokerage-agreement E05-S8).

/** A reason of a suspension inside a sentence ("Suspended since …: a complaint."), and as a choice of the dialog. */
const SUSPENSION_REASON_TEXT: Record<SuspensionReasonType, readonly [EligibilityKey, EligibilityKey]> = {
  COMPLAINT: ["stop.reasons.COMPLAINT", "stop.suspendDialog.reasons.COMPLAINT"],
  SUSPECTED_FRAUD: ["stop.reasons.SUSPECTED_FRAUD", "stop.suspendDialog.reasons.SUSPECTED_FRAUD"],
  DISPUTE: ["stop.reasons.DISPUTE", "stop.suspendDialog.reasons.DISPUTE"],
  NEEDS_CHECK: ["stop.reasons.NEEDS_CHECK", "stop.suspendDialog.reasons.NEEDS_CHECK"],
};

/** How the owner said they withdrew, inside the line ("told by a phone call"), and as a choice of the dialog. */
const CHANNEL_TEXT: Record<WithdrawalChannel, readonly [EligibilityKey, EligibilityKey]> = {
  PHONE_CALL: ["stop.channels.PHONE_CALL", "stop.terminateDialog.channels.PHONE_CALL"],
  IN_PERSON: ["stop.channels.IN_PERSON", "stop.terminateDialog.channels.IN_PERSON"],
  MESSAGE: ["stop.channels.MESSAGE", "stop.terminateDialog.channels.MESSAGE"],
  EMAIL: ["stop.channels.EMAIL", "stop.terminateDialog.channels.EMAIL"],
  OTHER: ["stop.channels.OTHER", "stop.terminateDialog.channels.OTHER"],
};

/** Whether Sunvibe introduced the tenant, inside the line ("tenant introduced by Sunvibe: yes"), and as a choice. */
const INTRODUCED_TEXT: Record<IntroducedBySunvibe, readonly [EligibilityKey, EligibilityKey]> = {
  YES: ["stop.introduced.YES", "stop.terminateDialog.introduced.YES"],
  NO: ["stop.introduced.NO", "stop.terminateDialog.introduced.NO"],
  UNKNOWN: ["stop.introduced.UNKNOWN", "stop.terminateDialog.introduced.UNKNOWN"],
};

const TERMINATION_TYPE_TEXT: Record<TerminationType, EligibilityKey> = {
  OWNER_WITHDREW: "stop.types.OWNER_WITHDREW",
  UNIT_LET: "stop.types.UNIT_LET",
  SUNVIBE_TERMINATED: "stop.types.SUNVIBE_TERMINATED",
};

/** The choices of the dialogs, in the contract's order. */
export const SUSPENSION_REASONS = Object.keys(SUSPENSION_REASON_TEXT) as SuspensionReasonType[];
export const WITHDRAWAL_CHANNELS = Object.keys(CHANNEL_TEXT) as WithdrawalChannel[];
export const INTRODUCED_VALUES = Object.keys(INTRODUCED_TEXT) as IntroducedBySunvibe[];

function entryOf<T>(table: Readonly<Record<string, T>>, code: string | null | undefined): T | undefined {
  return typeof code === "string" && Object.hasOwn(table, code) ? table[code] : undefined;
}

/** The reason of a suspension in a line; a code this UI does not know reads "another reason", never dropped. */
export function suspensionReasonText(code: string | null | undefined): EligibilityKey {
  return entryOf(SUSPENSION_REASON_TEXT, code)?.[0] ?? "stop.reasons.OTHER";
}

/** The reason of a suspension as a choice of the suspension dialog. */
export function suspensionReasonChoiceText(code: SuspensionReasonType): EligibilityKey {
  return SUSPENSION_REASON_TEXT[code][1];
}

/** How the owner said they withdrew, in a line; a code this UI does not know reads "another channel". */
export function channelText(code: string | null | undefined): EligibilityKey {
  return entryOf(CHANNEL_TEXT, code)?.[0] ?? "stop.channels.OTHER";
}

export function channelChoiceText(code: WithdrawalChannel): EligibilityKey {
  return CHANNEL_TEXT[code][1];
}

/** Whether Sunvibe introduced the tenant, in a line; a code this UI does not know reads "not known". */
export function introducedText(code: string | null | undefined): EligibilityKey {
  return entryOf(INTRODUCED_TEXT, code)?.[0] ?? "stop.introduced.UNKNOWN";
}

export function introducedChoiceText(code: IntroducedBySunvibe): EligibilityKey {
  return INTRODUCED_TEXT[code][1];
}

/** A termination type as the dialog offers it; a code this UI does not know reads "Another reason". */
export function terminationTypeText(code: string | null | undefined): EligibilityKey {
  return entryOf(TERMINATION_TYPE_TEXT, code) ?? "stop.types.OTHER";
}

/** The refusal codes of the stops (brokerage-agreement S8-D12), each read as the server's fixed sentence. */
const STOP_ERROR_TEXT: Readonly<Record<string, EligibilityKey>> = {
  AGREEMENT_ASSIGNEE_ONLY: "stop.errors.AGREEMENT_ASSIGNEE_ONLY",
  AGREEMENT_RELEASER_NOT_INDEPENDENT: "stop.errors.AGREEMENT_RELEASER_NOT_INDEPENDENT",
  AGREEMENT_TERMINATION_NOT_ALLOWED: "stop.errors.AGREEMENT_TERMINATION_NOT_ALLOWED",
  AGREEMENT_NOT_IN_EFFECT: "stop.errors.AGREEMENT_NOT_IN_EFFECT",
  AGREEMENT_ENDED: "stop.errors.AGREEMENT_ENDED",
  AGREEMENT_ALREADY_SUSPENDED: "stop.errors.AGREEMENT_ALREADY_SUSPENDED",
  AGREEMENT_NOT_SUSPENDED: "stop.errors.AGREEMENT_NOT_SUSPENDED",
  AGREEMENT_TOOK_EFFECT: "stop.errors.AGREEMENT_TOOK_EFFECT",
};

/**
 * The sentence of a refused stop (brokerage-agreement E05-S8, E05S8-P13, E05S8-P15), by code, never by message: each code
 * of S8-D12 reads the server's fixed English sentence word for word; 403 FORBIDDEN and any other 403 or 409 code read
 * "This agreement changed. Read it again.", since the page reads it again.
 */
export function stopErrorKey(code: string): EligibilityKey {
  return entryOf(STOP_ERROR_TEXT, code) ?? "stop.errors.changed";
}
