import type { BrokerageAgreementHistoryEntry } from "../types";

import type { EligibilityKey } from "./reason-text";

type EventType = NonNullable<BrokerageAgreementHistoryEntry["type"]>;

/** `Record` over the generated union: an event code without a text fails `npm run typecheck` (brokerage-agreement S7-D8). */
const EVENT_TEXT: Record<EventType, EligibilityKey> = {
  CREATED: "history.events.CREATED",
  DRAFT_EDITED: "history.events.DRAFT_EDITED",
  VERSION_SENT: "history.events.VERSION_SENT",
  OWNER_CONFIRMED: "history.events.OWNER_CONFIRMED",
  OWNER_REJECTED: "history.events.OWNER_REJECTED",
  VERSION_LAPSED: "history.events.VERSION_LAPSED",
  DRAFT_OPENED: "history.events.DRAFT_OPENED",
  ACTIVATED: "history.events.ACTIVATED",
  ACTIVATION_REFUSED: "history.events.ACTIVATION_REFUSED",
  VERSION_STARTED: "history.events.VERSION_STARTED",
  OTHER: "history.events.OTHER",
};

/**
 * The text of a history event (brokerage-agreement E05-S7, S7-D8): the server's `OTHER` and a code this UI does not know
 * both read "Another event", so an entry is shown and never dropped.
 */
export function historyEventText(code: string | undefined): EligibilityKey {
  return code !== undefined && Object.hasOwn(EVENT_TEXT, code) ? EVENT_TEXT[code as EventType] : "history.events.OTHER";
}

/** Who acted, as the history shows it: a staff member's name as the server answers it, or a fixed text. */
export type HistoryActor = { name: string } | { key: EligibilityKey };

/**
 * The actor of a history entry (brokerage-agreement S7-D7, BR-17): a staff member by the name the server answers, or "A
 * staff member" without one; the owner and Sunvibe's own job by fixed texts, never by name; an actor type this UI does
 * not know shows no actor text (E05S7-P8).
 */
export function historyActorText(actorType: string | undefined, actorName: string | null | undefined): HistoryActor | null {
  switch (actorType) {
    case "STAFF":
      return typeof actorName === "string" && actorName.trim() !== "" ? { name: actorName } : { key: "history.actors.staffUnknown" };
    case "OWNER":
      return { key: "history.actors.owner" };
    case "SYSTEM":
      return { key: "history.actors.system" };
    default:
      return null;
  }
}
