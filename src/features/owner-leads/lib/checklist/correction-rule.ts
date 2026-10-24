import {
  CHECKLIST_GROUP_PATHS,
  type ChecklistContent,
  type ChecklistGroupPath,
  type ChecklistInput,
  type ChecklistUnitMeta,
  type ChecklistView,
  type ChecklistVisit,
} from "@/features/surveys";

import { inputOfContent, type GroupContext, type RentalScope, unitsOfInput } from "./group-input";
import { sameUnit } from "./unit-equality";
import { parseUnitKey, unitKey } from "./units";

// The page's correction rule (survey-checklist spec 4.5, A-19, BR-22, BR-27): a save that replaces or removes a
// recorded unit whose observer, owner-report receiver or last editor is someone else asks for a correction first. It
// reads the units' `meta`; the server decides. Tombstones are server-only (A-29): an entry put back after its removal
// has no `meta` here, so the page asks nothing and the server's 400 on `correction` opens the box (W16-46, W16-47).

/** Why the panel asks for a correction (spec 6.2): the unit it is about and the person it protects. */
export type CorrectionReason =
  | { kind: "seen-by-performer"; unitKey: string; name: string | null; surveyNo: number | null }
  | {
      kind: "heard-by";
      unitKey: string;
      name: string | null;
      /** A receiver-only change of this statement: its date, for the box's hint (BR-27, BR-21 "ngày chủ nói"). */
      sameStatementOn?: string;
    }
  | { kind: "entered-by"; unitKey: string; name: string | null };

type Json = Record<string, unknown>;

/** Authored notes change freely: they are the writer's words, not on-site values (A-26, BR-26). */
const NOTES = new Set(["differenceNote", "otherPartsNote", "generalNote", "layoutNote"]);

/** The stored `meta` of every unit of a group, by unit key (wrappers, `fieldMeta`, spaces, items and hazards). */
export function metaOfUnits<G extends ChecklistGroupPath>(
  group: G,
  content: ChecklistContent[G] | undefined,
): Map<string, ChecklistUnitMeta> {
  const metas = new Map<string, ChecklistUnitMeta>();
  const put = (key: string, holder: unknown) => {
    const meta = (holder as { meta?: ChecklistUnitMeta | null } | null | undefined)?.meta;
    if (meta) metas.set(key, meta);
  };
  const json = (content ?? {}) as Json;
  const spaces = (json.spaces ?? []) as Json[];
  for (const [field, value] of Object.entries(json)) {
    if (field === "spaces" || field === "fieldMeta" || field === "common") continue;
    if (Array.isArray(value)) continue;
    put(unitKey.field(group, field), value);
  }
  const fieldMeta = json.fieldMeta as Record<string, ChecklistUnitMeta | null> | undefined;
  for (const [field, meta] of Object.entries(fieldMeta ?? {})) if (meta) metas.set(unitKey.field(group, field), meta);
  if (group === "identification") {
    for (const space of spaces) put(unitKey.space(String(space.spaceId)), space);
    return metas;
  }
  if (group === "safety") {
    const hazards = json.hazards as { value?: Json[] | null } | undefined;
    for (const hazard of hazards?.value ?? []) put(unitKey.hazard(String(hazard.hazardId)), hazard);
    return metas;
  }
  if (group === "amenities") {
    for (const item of (json.sharedItems ?? []) as Json[]) put(unitKey.sharedItem(String(item.code)), item);
    for (const item of (json.otherItems ?? []) as Json[]) put(unitKey.otherItem(String(item.itemId)), item);
  }
  if (group === "terms") {
    for (const [field, term] of Object.entries((json.common ?? {}) as Json)) put(unitKey.commonTerm(field), term);
  }
  for (const space of spaces) {
    const spaceId = String(space.spaceId);
    for (const [field, value] of Object.entries(space)) {
      if (field === "spaceId" || field === "items" || field === "fieldMeta" || field === "chargeOverrides") continue;
      put(unitKey.spaceField(group, spaceId, field), value);
    }
    const spaceFieldMeta = space.fieldMeta as Record<string, ChecklistUnitMeta | null> | undefined;
    for (const [field, meta] of Object.entries(spaceFieldMeta ?? {})) {
      if (meta) metas.set(unitKey.spaceField(group, spaceId, field), meta);
    }
    for (const item of (space.items ?? []) as Json[]) put(unitKey.spaceItem(spaceId, String(item.code)), item);
    for (const [charge, term] of Object.entries((space.chargeOverrides ?? {}) as Json)) {
      put(unitKey.override(spaceId, charge), term);
    }
  }
  return metas;
}

type Sourced = { state?: string; value?: unknown; source?: string | null; confirmedOn?: string | null; receivedByUserId?: string | null };

/** The business value of A-19: what the unit records other than its source, date, receiver and relay basis. */
function businessValue(key: string, unit: Json): unknown {
  const parsed = parseUnitKey(key);
  if (parsed?.kind === "sharedItem" || parsed?.kind === "spaceItem") return unit.presence;
  if (parsed?.kind === "otherItem") return [unit.label, unit.spaceId, unit.presence];
  return unit.value;
}

const recorded = (unit: Json) => !("state" in unit) || unit.state === "VALUE";

/**
 * True when `after` is a new owner statement against the stored one (BR-27, A-19): a later date, or the same date with
 * another receiver and another business value. A cleared statement keeps no value: only a later date frees it.
 */
function newStatement(key: string, before: Json | undefined, after: Json | undefined, meta: ChecklistUnitMeta): boolean {
  const next = after as Sourced | undefined;
  if (!next || next.source !== "OWNER_STATED" || !next.confirmedOn) return false;
  if (before && (before as Sourced).source === "OWNER_STATED" && recorded(before)) {
    const stored = before as Sourced;
    if (!stored.confirmedOn) return false;
    if (next.confirmedOn > stored.confirmedOn) return true;
    return (
      next.confirmedOn === stored.confirmedOn &&
      next.receivedByUserId !== stored.receivedByUserId &&
      !sameUnit(businessValue(key, before), businessValue(key, after as Json))
    );
  }
  // A cleared owner statement (UNKNOWN with its last source kept): only a later date makes a refill a new statement.
  return meta.lastSource === "OWNER_STATED" && !!meta.observedOn && next.confirmedOn > meta.observedOn;
}

type Hazard = {
  description?: string;
  severity?: string;
  spaceId?: string | null;
  previous?: unknown;
  status?: string;
  statusNote?: string | null;
  ownerReportedOn?: string | null;
  receivedByUserId?: string | null;
};

/** A hazard whose only change is a first owner fix report or a newer one (A-19); only on a stored hazard (A-29). */
function onlyNewFixReport(before: Hazard | undefined, after: Hazard | undefined): boolean {
  if (!before || !after) return false;
  const same = (field: keyof Hazard) => sameUnit(before[field] ?? null, after[field] ?? null);
  if (!same("description") || !same("severity") || !same("spaceId") || !same("previous")) return false;
  if (after.status !== "OWNER_REPORTED_FIXED" || !after.ownerReportedOn) return false;
  if (before.status === "OPEN") return true;
  if (before.status !== "OWNER_REPORTED_FIXED" || !before.ownerReportedOn) return false;
  if (after.ownerReportedOn > before.ownerReportedOn) return true;
  return (
    after.ownerReportedOn === before.ownerReportedOn &&
    after.receivedByUserId !== before.receivedByUserId &&
    !sameUnit(before.statusNote ?? null, after.statusNote ?? null)
  );
}

/** The date of an owner statement whose only change is its receiver (same value and date), else null. */
function receiverOnlyChange(key: string, before: Json | undefined, after: Json | undefined): string | null {
  const a = before as Sourced | undefined;
  const b = after as Sourced | undefined;
  if (!a || !b || a.source !== "OWNER_STATED" || b.source !== "OWNER_STATED" || !a.confirmedOn) return null;
  if (a.confirmedOn !== b.confirmedOn || a.receivedByUserId === b.receivedByUserId) return null;
  return sameUnit(businessValue(key, before as Json), businessValue(key, after as Json)) ? a.confirmedOn : null;
}

const REPORT_FIELDS = ["status", "ownerReportedOn", "receivedByUserId", "statusNote", "relayBasis"] as const;

type Report = Hazard & { relayBasis?: string | null };

/** True when a stored owner fix report is removed (with its hazard or its status) or any of its facts changes. */
function reportChanged(before: Report, after: Report | null): boolean {
  if (after === null) return true;
  return REPORT_FIELDS.some((field) => !sameUnit(before[field] ?? null, after[field] ?? null));
}

/** The people a recorded unit protects, as reasons; empty when only the viewer is protected. */
function protectedBy(
  key: string,
  meta: ChecklistUnitMeta,
  viewerUserId: string,
  visit: ChecklistVisit | undefined,
  report: { userId: string; name: string | null } | null,
): CorrectionReason[] {
  const reasons: CorrectionReason[] = [];
  const observer = meta.observedByUserId ?? null;
  if (observer !== null && observer !== viewerUserId) {
    if (meta.lastSource === "OWNER_STATED") {
      reasons.push({ kind: "heard-by", unitKey: key, name: meta.observedByName ?? null });
    } else {
      reasons.push({
        kind: "seen-by-performer",
        unitKey: key,
        name: visit?.performedByName ?? meta.observedByName ?? null,
        surveyNo: visit?.appointmentNo ?? null,
      });
    }
  }
  // A hazard carrying an owner fix report is protected by the report's receiver too (BR-27).
  if (report !== null && report.userId !== viewerUserId && report.userId !== observer) {
    reasons.push({ kind: "heard-by", unitKey: key, name: report.name });
  }
  if (reasons.length === 0 && meta.enteredByUserId && meta.enteredByUserId !== viewerUserId) {
    reasons.push({ kind: "entered-by", unitKey: key, name: meta.enteredByName ?? null });
  }
  return reasons;
}

/** The hazard list wrapper changes only by its state or reason, or when a recorded "none seen" gets entries (A-19). */
function hazardListChanged(before: unknown, after: unknown): boolean {
  const a = before as { state?: string; naReason?: unknown; none?: boolean };
  const b = after as { state?: string; naReason?: unknown; none?: boolean };
  return a.state !== b.state || !sameUnit(a.naReason ?? null, b.naReason ?? null) || (a.none === true && b.none === false);
}

function compare<G extends ChecklistGroupPath>(
  group: G,
  content: ChecklistContent[G] | undefined,
  stored: Map<string, unknown>,
  next: Map<string, unknown>,
  viewerUserId: string,
  visit: ChecklistVisit | undefined,
): CorrectionReason[] {
  const metas = metaOfUnits(group, content);
  const reportNames = new Map<string, string | null>();
  if (group === "safety") {
    const hazards = (content as ChecklistContent["safety"] | undefined)?.hazards?.value ?? [];
    for (const hazard of hazards) reportNames.set(String(hazard.hazardId), hazard.receivedByName ?? null);
  }
  const reasons: CorrectionReason[] = [];
  const keys = [...new Set([...stored.keys(), ...next.keys()])];
  for (const key of keys) {
    const before = stored.get(key) as Json | null | undefined;
    const after = next.get(key) as Json | null | undefined;
    const parsed = parseUnitKey(key);
    if (parsed?.kind === "hazardList" ? !hazardListChanged(before, after) : sameUnit(before ?? null, after ?? null)) continue;

    // Adding a charge override replaces what the recorded common charge gives that space (A-19).
    if (parsed?.kind === "override" && (before ?? null) === null && after) {
      const commonKey = unitKey.commonTerm(parsed.charge);
      const commonMeta = metas.get(commonKey);
      const common = stored.get(commonKey) as Json | null | undefined;
      if (commonMeta && common && recorded(common) && commonMeta.lastSource !== "OWNER_FORM") {
        if (!newStatement(commonKey, common, after, commonMeta)) {
          reasons.push(...protectedBy(commonKey, commonMeta, viewerUserId, visit, null));
        }
      }
      continue;
    }

    const meta = metas.get(key);
    // Filling a unit that never held a value, adding an entry, or an entry put back (its tombstone is server-only).
    if (!meta || before === undefined) continue;
    const field = parsed?.kind === "field" || parsed?.kind === "spaceField" ? parsed.field : null;
    if (field !== null && NOTES.has(field)) continue;
    if (meta.lastSource === "OWNER_FORM" || (before as Sourced | null)?.source === "OWNER_FORM") continue;
    if (newStatement(key, before ?? undefined, after ?? undefined, meta)) continue;
    let report: { userId: string; name: string | null } | null = null;
    if (parsed?.kind === "hazard") {
      if (onlyNewFixReport(before as Hazard | undefined, (after ?? undefined) as Hazard | undefined)) continue;
      const stored = before as Hazard | null;
      // The report's receiver is protected when the report is edited or removed, not for other changes (A-19).
      if (
        stored?.status === "OWNER_REPORTED_FIXED" &&
        stored.receivedByUserId &&
        reportChanged(stored, (after ?? null) as Hazard | null)
      ) {
        report = { userId: stored.receivedByUserId, name: reportNames.get(parsed.hazardId) ?? null };
      }
    }
    const found = protectedBy(key, meta, viewerUserId, visit, report);
    const date = receiverOnlyChange(key, before ?? undefined, after ?? undefined);
    reasons.push(...found.map((reason) => (reason.kind === "heard-by" && date !== null ? { ...reason, sameStatementOn: date } : reason)));
  }
  return reasons;
}

/**
 * The reasons a save of `group` with `input` needs a correction (spec 4.5, A-19); empty = no correction box. `ctx` is
 * the G1 spaces and scope the content was read with.
 */
export function correctionReasons<G extends ChecklistGroupPath>(
  group: G,
  content: ChecklistContent[G] | undefined,
  input: ChecklistInput[G],
  viewerUserId: string,
  visit: ChecklistVisit | undefined,
  ctx: GroupContext,
): CorrectionReason[] {
  const stored = unitsOfInput(group, inputOfContent(group, content, ctx));
  return compare(group, content, stored, unitsOfInput(group, input), viewerUserId, visit);
}

/** The G1 spaces and scope of the checklist on screen. */
export function contextOf(view: ChecklistView): GroupContext {
  const g1 = view.groups?.identification?.content;
  return { spaces: (g1?.spaces ?? []).map((space) => space.spaceId ?? ""), scope: (g1?.rentalScope ?? null) as RentalScope | null };
}

/**
 * What a G1 save also clears in the other groups (a removed space's entries, its detached hazards, the units a scope
 * switch drops, A-12) that someone else recorded: one correction covers them with the G1 change (spec 6.2).
 */
export function cascadeReasons(
  view: ChecklistView,
  nextG1: ChecklistInput["identification"],
  viewerUserId: string,
): CorrectionReason[] {
  const before = contextOf(view);
  const after: GroupContext = { spaces: nextG1.spaces.map((space) => space.spaceId), scope: nextG1.rentalScope };
  return CHECKLIST_GROUP_PATHS.filter((group) => group !== "identification").flatMap((group) => {
    const content = view.groups?.[group]?.content;
    const stored = unitsOfInput(group, inputOfContent(group, content as never, before));
    const next = unitsOfInput(group, inputOfContent(group, content as never, after));
    return compare(group, content as never, stored, next, viewerUserId, view.visit);
  });
}

/** True when a G1 save changes what other groups hold: a removed space or a scope switch (A-12). */
export function g1Cascades(view: ChecklistView, nextG1: ChecklistInput["identification"]): boolean {
  const before = contextOf(view);
  const nextIds = new Set(nextG1.spaces.map((space) => space.spaceId));
  return before.spaces.some((spaceId) => !nextIds.has(spaceId)) || (before.scope !== null && before.scope !== nextG1.rentalScope);
}

/** The reasons once per kind and person, for the box's "why" line. */
export function distinctReasons(reasons: readonly CorrectionReason[]): CorrectionReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const id = `${reason.kind}:${reason.name ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
