import type { ChecklistStaffMember } from "@/features/surveys";

import { sameUnit } from "./unit-equality";

// Who heard the owner (survey-checklist BR-21, BR-25, A-25): the receiver is picked from the lead's staff only, with
// "Me" as one option and nothing preselected; "How it reached you" is asked when someone else heard it.

export type ReceiverOption = { userId: string; me: boolean; name: string | null };

/** "Me" first, then the rest of `leadStaff` in its order; the control starts with no choice (W16-45). */
export function receiverOptions(leadStaff: readonly ChecklistStaffMember[], viewerUserId: string): ReceiverOption[] {
  const me = leadStaff.find((member) => member.userId === viewerUserId);
  const others = leadStaff
    .filter((member) => member.userId && member.userId !== viewerUserId)
    .map((member) => ({ userId: member.userId as string, me: false, name: member.name ?? null }));
  return [{ userId: viewerUserId, me: true, name: me?.name ?? null }, ...others];
}

type Statement = {
  source?: string | null;
  status?: string;
  receivedByUserId?: string | null;
  relayBasis?: string | null;
};

/** The unit's owner statement or owner fix report without its relay basis, or null when it holds neither. */
function statementOf(unit: unknown): Record<string, unknown> | null {
  if (unit === null || typeof unit !== "object") return null;
  const value = unit as Statement & Record<string, unknown>;
  const owner = value.source === "OWNER_STATED" || value.status === "OWNER_REPORTED_FIXED";
  if (!owner) return null;
  const rest = { ...value };
  delete rest.relayBasis;
  return rest;
}

/**
 * True exactly when the user creates or changes an owner statement or fix report that names someone else as the
 * receiver (A-18, W16-45); an unchanged unit keeps its stored line and asks nothing.
 */
export function needsRelayBasis(stored: unknown, next: unknown, viewerUserId: string): boolean {
  const after = statementOf(next);
  if (after === null) return false;
  const receiver = (next as Statement).receivedByUserId;
  if (!receiver || receiver === viewerUserId) return false;
  const before = statementOf(stored);
  return before === null || !sameUnit(before, after);
}

/**
 * A created or changed owner statement or fix report heard by the viewer keeps no relay basis (A-18: null when the
 * receiver is the caller); an unchanged unit keeps what it stores, as does a statement someone else heard.
 */
export function withRelayRule<U>(next: U, stored: unknown, viewerUserId: string): U {
  if (statementOf(next) === null) return next;
  const unit = next as Statement;
  if (unit.receivedByUserId !== viewerUserId) return next;
  // An edit put back to the stored statement is no edit: the stored unit, with its relay basis, comes back.
  const storedRelay = statementOf(stored) === null ? undefined : ((stored as Statement).relayBasis ?? null);
  if (storedRelay !== undefined && sameUnit(stored, { ...unit, relayBasis: storedRelay })) return stored as U;
  if (!unit.relayBasis) return next;
  return { ...unit, relayBasis: null } as U;
}
