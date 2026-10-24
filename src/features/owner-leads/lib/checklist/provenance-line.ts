import type { ChecklistCorrection, ChecklistUnitMeta, ChecklistVisit } from "@/features/surveys";
import { formatDate, formatDateTime, vietnamDate } from "@/lib/format/vietnam-time";

import type { OwnerLeadsTranslate } from "../history-activity-text";

// The provenance line of a unit (survey-checklist spec 6.2): where the value came from, then who entered it and, when
// corrected, by whom and why. Owner statements and form values never read as checked on site (BR-17, BR-19); a note is
// the writer's note (A-26).

/** Where the value came from. */
export type ProvenanceOrigin =
  | { kind: "site"; how: "seen" | "measured" | "estimated"; surveyNo: number | null; name: string | null; date: string | null }
  | { kind: "owner"; date: string | null; name: string | null; relay: string | null }
  | { kind: "form"; date: string | null }
  | { kind: "note"; name: string | null; date: string; notACheck: boolean }
  | { kind: "cleared"; name: string | null; at: string; was: ProvenanceOrigin };

export type ProvenanceLine = {
  origin: ProvenanceOrigin;
  entered: { name: string | null; at: string } | null;
  corrected: { name: string | null; reason: string } | null;
};

/** What the line needs of the unit itself: its state and source, its relay basis, and whether it is a note. */
export type ProvenanceUnit = {
  state?: string;
  source?: string | null;
  relayBasis?: string | null;
  /** An authored note (A-26), or the note of an area check. */
  note?: boolean;
  /** The note of a NOT_ENTERED area check: "(not a check)". */
  notACheck?: boolean;
};

function originOf(unit: ProvenanceUnit, meta: ChecklistUnitMeta, visit: ChecklistVisit | undefined): ProvenanceOrigin {
  const source = meta.lastSource ?? unit.source ?? null;
  if (source === "OWNER_STATED") {
    return { kind: "owner", date: meta.observedOn ?? null, name: meta.observedByName ?? null, relay: unit.relayBasis ?? null };
  }
  if (source === "OWNER_FORM") return { kind: "form", date: meta.observedOn ?? null };
  return {
    kind: "site",
    how: source === "MEASURED" ? "measured" : source === "ESTIMATED" ? "estimated" : "seen",
    surveyNo: visit?.appointmentNo ?? null,
    name: meta.observedByName ?? visit?.performedByName ?? null,
    date: meta.observedOn ?? null,
  };
}

/** The provenance of a unit with `meta`, or null for a unit never filled in this checklist. */
export function provenanceLine(
  unit: ProvenanceUnit,
  meta: ChecklistUnitMeta | null | undefined,
  visit: ChecklistVisit | undefined,
  corrections: readonly ChecklistCorrection[],
): ProvenanceLine | null {
  if (!meta) return null;
  const at = meta.enteredAt ?? "";
  if (unit.note) {
    return {
      origin: { kind: "note", name: meta.enteredByName ?? null, date: vietnamDate(at), notACheck: unit.notACheck === true },
      entered: null,
      corrected: null,
    };
  }
  const origin = originOf(unit, meta, visit);
  if (unit.state === "UNKNOWN") {
    return { origin: { kind: "cleared", name: meta.enteredByName ?? null, at, was: origin }, entered: null, corrected: null };
  }
  const correction = meta.correctionSaveId
    ? corrections.find((entry) => entry.saveId === meta.correctionSaveId)
    : undefined;
  return {
    origin,
    entered: { name: meta.enteredByName ?? null, at },
    corrected: correction ? { name: correction.actorName ?? null, reason: correction.reason ?? "" } : null,
  };
}

const day = (isoDate: string | null) => (isoDate ? formatDate(isoDate) : "");

function originText(origin: ProvenanceOrigin, t: OwnerLeadsTranslate, name: (value: string | null) => string): string {
  switch (origin.kind) {
    case "site":
      return t(
        origin.how === "measured"
          ? "checklist.provenance.measured"
          : origin.how === "estimated"
            ? "checklist.provenance.estimated"
            : "checklist.provenance.site",
        { no: origin.surveyNo ?? "", name: name(origin.name), date: day(origin.date) },
      );
    case "owner":
      return origin.relay
        ? t("checklist.provenance.ownerRelay", { date: day(origin.date), name: name(origin.name), relay: origin.relay })
        : t("checklist.provenance.owner", { date: day(origin.date), name: name(origin.name) });
    case "form":
      return t("checklist.provenance.form", { date: day(origin.date) });
    case "note":
      return t(origin.notACheck ? "checklist.provenance.noteNotCheck" : "checklist.provenance.note", {
        name: name(origin.name),
        date: day(origin.date),
      });
    case "cleared":
      return t("checklist.provenance.cleared", {
        name: name(origin.name),
        date: formatDateTime(origin.at).slice(0, 5),
        line: originText(origin.was, t, name),
      });
  }
}

/** The line as texts: the origin, then "entered by ..." and "Corrected by ..." when they apply. */
export function formatProvenance(line: ProvenanceLine | null, t: OwnerLeadsTranslate): string[] {
  if (line === null) return [];
  const name = (value: string | null) => value?.trim() || t("checklist.provenance.unknownName");
  const texts = [originText(line.origin, t, name)];
  if (line.entered) {
    const when = formatDateTime(line.entered.at);
    texts.push(t("checklist.provenance.entered", { name: name(line.entered.name), when: `${when.slice(0, 5)} ${when.slice(11)}` }));
  }
  if (line.corrected) texts.push(t("checklist.provenance.corrected", { name: name(line.corrected.name), reason: line.corrected.reason }));
  return texts;
}
