import {
  CHECKLIST_GROUP_PATHS,
  type ChecklistContent,
  type ChecklistCorrection,
  type ChecklistGroupPath,
  type ChecklistGroups,
  type ChecklistUnitMeta,
  type ChecklistView,
  type ChecklistVisit,
} from "@/features/surveys";

import type { OwnerLeadsTranslate } from "../history-activity-text";
import type { OwnerLeadsKey } from "../labels";

import { metaOfUnits } from "./correction-rule";
import { effectiveTermsBySpace } from "./effective-terms-view";
import { type GroupContext, inputOfContent, type RentalScope, unitsOfInput } from "./group-input";
import { formatProvenance, provenanceLine } from "./provenance-line";
import { readinessView } from "./readiness-view";
import { fieldOfKey, parseUnitKey, spaceIdOfKey } from "./units";
import { unitText } from "./value-text";

// The read-only rendering of a checklist (survey-checklist spec 6.2 Preview, W16-28, W16-31): every group and space
// with each value or state and its provenance line, then the effective G8 terms, the known gaps with links into Edit,
// the unconfirmed terms and the warnings. The same sections render a takeover's checkpoint and the read-only Edit.

export type PreviewRow = { key: string; field: string; label: string; text: string; provenance: string[] };
export type PreviewSpace = { spaceId: string; code: string; rows: PreviewRow[] };
export type PreviewSection = { group: ChecklistGroupPath | "evidence"; asset: PreviewRow[]; spaces: PreviewSpace[] };

const NOTES = new Set(["differenceNote", "otherPartsNote", "generalNote", "layoutNote"]);
const AREA_CHECKS = new Set(["mainSpace", "kitchen", "bathroom", "sharedKitchen", "sharedBathroom"]);

type Json = Record<string, unknown>;
type Context = { visit?: ChecklistVisit; corrections?: ChecklistCorrection[] };

function entryText(key: string, value: Json, t: OwnerLeadsTranslate, names: Map<string, string | null>): { label: string; text: string } {
  const parsed = parseUnitKey(key);
  const presence = (value.presence === "NO" ? t("checklist.values.yesNo.NO") : t("checklist.values.yesNo.YES"));
  switch (parsed?.kind) {
    case "space":
      return {
        label: t("checklist.fields.spaces"),
        text: [value.code, value.location, value.description].filter((part) => typeof part === "string" && part.trim() !== "").join(" · "),
      };
    case "hazard": {
      const parts = [
        String(value.description ?? ""),
        t(`checklist.values.severity.${(value.severity ?? "UNCLASSIFIED") as "MINOR"}`),
        t(`checklist.values.status.${(value.status ?? "OPEN") as "OPEN"}`),
      ];
      if (typeof value.statusNote === "string" && value.statusNote.trim()) parts.push(value.statusNote);
      if (value.status === "OWNER_REPORTED_FIXED" && typeof value.ownerReportedOn === "string") {
        const name = names.get(String(value.hazardId)) ?? null;
        parts.push(
          t("checklist.provenance.owner", {
            date: value.ownerReportedOn.split("-").reverse().join("/"),
            name: name?.trim() || t("checklist.provenance.unknownName"),
          }),
        );
      }
      return { label: t("checklist.fields.hazards"), text: parts.join(" · ") };
    }
    case "sharedItem":
    case "spaceItem":
      return { label: t("checklist.fields.presence"), text: `${t(`checklist.values.items.${parsed.code as "BED"}`)}: ${presence}` };
    case "otherItem":
      return { label: t("checklist.fields.otherItems"), text: `${String(value.label ?? "")}: ${presence}` };
    default:
      return { label: "", text: "" };
  }
}

function hazardListText(unit: unknown, t: OwnerLeadsTranslate): string {
  const list = unit as { state?: string; none?: boolean; naReason?: string | null };
  if (list.state === "VALUE") return list.none ? t("checklist.fields.hazardsNone") : t("checklist.fields.hazardsList");
  return unitText("hazards", list, t);
}

function rowOf(
  key: string,
  unit: unknown,
  meta: ChecklistUnitMeta | undefined,
  context: Context,
  t: OwnerLeadsTranslate,
  names: Map<string, string | null>,
): PreviewRow | null {
  const parsed = parseUnitKey(key);
  const field = fieldOfKey(key) ?? "";
  if (parsed?.kind === "override" && unit === null) return null;
  if (field === "spaceFees" && unit === null) return null;
  if ((field === "sharedKitchen" || field === "sharedBathroom") && unit === null) return null;
  const isEntry = parsed !== null && ["space", "hazard", "sharedItem", "spaceItem", "otherItem"].includes(parsed.kind);
  const json = (unit ?? {}) as Json;
  let label: string;
  let text: string;
  if (isEntry) ({ label, text } = entryText(key, json, t, names));
  else {
    label = t(`checklist.fields.${field}` as OwnerLeadsKey);
    text = parsed?.kind === "hazardList" ? hazardListText(unit, t) : unitText(field, unit, t);
  }
  if (parsed?.kind === "override") label = `${label} (${t("checklist.terms.override")})`;
  const note = NOTES.has(field);
  const state = isEntry ? "VALUE" : typeof json.state === "string" ? json.state : note || field === "rentalScope" ? (unit ? "VALUE" : "UNKNOWN") : "VALUE";
  const provenance = formatProvenance(
    provenanceLine(
      { state, source: (json.source as string | null | undefined) ?? null, relayBasis: (json.relayBasis as string | null) ?? null, note },
      meta,
      context.visit,
      context.corrections ?? [],
    ),
    t,
  );
  const check = json.value as Json | null | undefined;
  if (AREA_CHECKS.has(field) && check?.result === "NOT_ENTERED" && typeof check.note === "string" && check.note.trim() && meta) {
    provenance.push(...formatProvenance(provenanceLine({ state: "VALUE", note: true, notACheck: true }, meta, context.visit, []), t));
  }
  return { key, field, label, text, provenance };
}

function sectionOf<G extends ChecklistGroupPath>(
  group: G,
  content: ChecklistContent[G] | undefined,
  ctx: GroupContext,
  codes: Map<string, string>,
  context: Context,
  t: OwnerLeadsTranslate,
): PreviewSection {
  const units = unitsOfInput(group, inputOfContent(group, content, ctx));
  const metas = metaOfUnits(group, content);
  const names = new Map<string, string | null>();
  if (group === "safety") {
    for (const hazard of (content as ChecklistContent["safety"] | undefined)?.hazards?.value ?? []) {
      names.set(String(hazard.hazardId), hazard.receivedByName ?? null);
    }
  }
  const asset: PreviewRow[] = [];
  const spaces = new Map<string, PreviewRow[]>(ctx.spaces.map((spaceId) => [spaceId, []]));
  for (const [key, unit] of units) {
    const row = rowOf(key, unit, metas.get(key), context, t, names);
    if (row === null) continue;
    const spaceId = parseUnitKey(key)?.kind === "space" ? null : spaceIdOfKey(key);
    if (spaceId !== null && spaces.has(spaceId)) spaces.get(spaceId)?.push(row);
    else asset.push(row);
  }
  return {
    group,
    asset,
    spaces: group === "identification" ? [] : [...spaces].map(([spaceId, rows]) => ({ spaceId, code: codes.get(spaceId) ?? "", rows })),
  };
}

/** The sections of every group (G7 as its placeholder) from a read's or a checkpoint's groups. */
export function previewSections(groups: Partial<ChecklistGroups>, context: Context, t: OwnerLeadsTranslate): PreviewSection[] {
  const g1 = groups.identification?.content;
  const ctx: GroupContext = { spaces: (g1?.spaces ?? []).map((space) => space.spaceId ?? ""), scope: (g1?.rentalScope ?? null) as RentalScope | null };
  const codes = new Map((g1?.spaces ?? []).map((space) => [space.spaceId ?? "", space.code ?? ""]));
  const sections: PreviewSection[] = [];
  for (const group of CHECKLIST_GROUP_PATHS) {
    if (group === "terms") sections.push({ group: "evidence", asset: [], spaces: [] });
    sections.push(sectionOf(group, groups[group]?.content as never, ctx, codes, context, t));
  }
  return sections;
}

export type PreviewLine = { text: string; anchor: string };
export type PreviewModel = {
  sections: PreviewSection[];
  effective: { spaceCode: string; charges: { label: string; text: string; origin: string }[]; commonFees: string; spaceFees: string | null }[];
  gaps: PreviewLine[];
  unconfirmed: PreviewLine[];
  warnings: string[];
};

const GROUP_TITLE = (group: string): OwnerLeadsKey => `checklist.groups.${group.toUpperCase() as "TERMS"}`;

/** The whole preview of a read (W16-31). */
export function previewModel(view: ChecklistView, t: OwnerLeadsTranslate): PreviewModel {
  const readiness = readinessView(view);
  const field = (name: string | null) => (name ? t(`checklist.fields.${name}` as OwnerLeadsKey) : "");
  const where = (group: string, spaceCode: string | null, name: string | null) =>
    spaceCode
      ? t("checklist.preview.spaceItem", { group: t(GROUP_TITLE(group)), space: spaceCode, field: field(name) })
      : name
        ? t("checklist.preview.item", { group: t(GROUP_TITLE(group)), field: field(name) })
        : t(GROUP_TITLE(group));
  return {
    sections: previewSections(view.groups ?? {}, view, t),
    effective: effectiveTermsBySpace(view).map((entry) => ({
      spaceCode: entry.spaceCode ?? "",
      charges: entry.charges.map((item) => ({
        label: field(item.charge),
        text: unitText(item.charge, item.term ?? null, t),
        origin: t(item.origin === "SPACE" ? "checklist.preview.originSpace" : "checklist.preview.originCommon"),
      })),
      commonFees: unitText("otherFees", entry.fees.common, t),
      spaceFees: entry.fees.space === null ? null : unitText("spaceFees", entry.fees.space, t),
    })),
    gaps: readiness.missing.map((item) => {
      const problem =
        item.problem === "REQUIRED_AREA_NOT_ENTERED"
          ? t("checklist.preview.problem.REQUIRED_AREA_NOT_ENTERED", { area: field(item.field) })
          : t(`checklist.preview.problem.${item.problem as "NOT_CHECKED"}`);
      const prefix = item.group === "evidence" || item.problem === "SCOPE_MISSING" || item.problem === "NO_SPACES" ? null : where(item.group, item.spaceCode, item.field);
      return { text: prefix ? `${prefix}: ${problem}` : problem, anchor: item.anchor };
    }),
    unconfirmed: readiness.unconfirmed.map((item) => ({ text: where(item.group, item.spaceCode, item.field), anchor: item.anchor })),
    warnings: readiness.warnings.map((item) =>
      item.type === "EARLIER_HAZARD_OPEN"
        ? t("checklist.preview.warning.EARLIER_HAZARD_OPEN", { no: item.checklistNo ?? "" })
        : item.type === "PARTIAL_ACCESS"
          ? t("checklist.preview.warning.PARTIAL_ACCESS", { space: item.spaceCode ?? "" })
          : t("checklist.preview.warning.OPEN_IMPORTANT_HAZARD"),
    ),
  };
}

