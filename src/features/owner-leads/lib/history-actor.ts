import type { LeadActivity } from "../types";

/** Who a history entry shows as its actor (spec 5.4). The UI picks the Vietnamese text per kind. */
export type HistoryActor =
  | { kind: "name"; name: string }
  | { kind: "owner" }
  | { kind: "system" }
  | { kind: "unknown" };

/**
 * `actorName` when present. Without an actor id, `SUBMITTED` is the owner and `AUTO_ASSIGNED` the system. Anything else
 * is unknown: an actor id without a name (no user row, W11-39) or a staff entry without any actor.
 */
export function historyActor(activity: LeadActivity): HistoryActor {
  const name = activity.actorName?.trim();
  if (name) return { kind: "name", name: activity.actorName as string };
  if (!activity.actorUserId) {
    if (activity.type === "SUBMITTED") return { kind: "owner" };
    if (activity.type === "AUTO_ASSIGNED") return { kind: "system" };
  }
  return { kind: "unknown" };
}
