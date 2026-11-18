import type { ReasonGroup } from "../types";

import type { EligibilityKey } from "./reason-text";

/** `Record` over the enum: a group without the owner's text fails `npm run typecheck`. */
const OWNER_REASON_TEXT: Record<ReasonGroup, EligibilityKey> = {
  BASIS: "owner.reasons.BASIS",
  PROPERTY: "owner.reasons.PROPERTY",
  UNIT: "owner.reasons.UNIT",
  OWNER: "owner.reasons.OWNER",
};

/**
 * The owner's text of a reason group that stops a confirmation (brokerage-agreement BR-3, E-2, E-5, E-11, spec section
 * 6), in the owner's words rather than the staff's; a group this UI does not know reads the `OTHER` text, never dropped.
 */
export function ownerReasonText(group: string): EligibilityKey {
  return Object.hasOwn(OWNER_REASON_TEXT, group) ? OWNER_REASON_TEXT[group as ReasonGroup] : "owner.reasons.OTHER";
}

/**
 * The owner's text of a version's effective state (brokerage-agreement E05-S5, spec section 6): waiting for their answer
 * only while it can be answered (the server gave the item a statement), confirmed, declined, no answer in time, withdrawn
 * by Sunvibe; signed and activated, in effect, or not activated by Sunvibe (E05-S6, S6-D19); any other state, or a code
 * this UI does not know, reads that Sunvibe is handling the version. The text follows the state the server answers; no
 * time is compared with the browser's clock (S5-D19 (5)).
 */
export function ownerStatusText(status: string, answerable: boolean): EligibilityKey {
  switch (status) {
    case "AWAITING_OWNER":
      return answerable ? "owner.state.awaiting" : "owner.state.handling";
    case "OWNER_CONFIRMED":
      return "owner.state.confirmed";
    case "OWNER_REJECTED":
      return "owner.state.rejected";
    case "LAPSED":
      return "owner.state.lapsed";
    case "CANCELLED":
      return "owner.state.cancelled";
    case "ACTIVATED":
      return "owner.state.activated";
    case "EFFECTIVE":
      return "owner.state.effective";
    case "ACTIVATION_REFUSED":
      return "owner.state.activationRefused";
    default:
      return "owner.state.handling";
  }
}
