import type { EligibilityKey } from "./reason-text";

/**
 * The owner's text of a version's effective state (brokerage-agreement E05-S5, spec section 6): waiting for their answer
 * only while it can be answered (the server gave the item a statement), confirmed, declined, no answer in time, withdrawn
 * by Sunvibe; any other state, or a code this UI does not know, reads that Sunvibe is handling the version. The text
 * follows the state the server answers; no time is compared with the browser's clock (S5-D19 (5)).
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
    default:
      return "owner.state.handling";
  }
}
