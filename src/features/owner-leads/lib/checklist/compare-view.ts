import type { OwnerLeadsTranslate } from "../history-activity-text";
import type { OwnerLeadsKey } from "../labels";

import { fieldOfKey, parseUnitKey, spaceIdOfKey } from "./units";
import { unitText } from "./value-text";

// The compare view of a 409 and the "Not kept" list (survey-checklist spec 6.2): each unit the user edited, named by
// its space and field, with the newly saved value next to the user's.

type Json = Record<string, unknown>;

/** "P1 · Area (m2)", "Shared kitchen", "Bed": the unit as the user knows it, never its ids. */
export function unitLabel(key: string, codes: ReadonlyMap<string, string>, t: OwnerLeadsTranslate): string {
  const parsed = parseUnitKey(key);
  const spaceId = parsed?.kind === "space" ? null : spaceIdOfKey(key);
  const space = spaceId === null ? null : (codes.get(spaceId) ?? null);
  let name: string;
  switch (parsed?.kind) {
    case "sharedItem":
    case "spaceItem":
      name = t(`checklist.values.items.${parsed.code as "BED"}`);
      break;
    case "otherItem":
      name = t("checklist.fields.otherItems");
      break;
    case "hazard":
      name = t("checklist.fields.hazards");
      break;
    case "space":
      name = codes.get(parsed.spaceId) ?? t("checklist.fields.spaces");
      break;
    case "override":
      name = `${t(`checklist.fields.${parsed.charge}` as OwnerLeadsKey)} (${t("checklist.terms.override")})`;
      break;
    default:
      name = t(`checklist.fields.${fieldOfKey(key) ?? ""}` as OwnerLeadsKey);
  }
  return space === null ? name : `${space} · ${name}`;
}

/** The text of any unit value, an entry included; "Removed" or "Nothing" for none. */
export function anyUnitText(key: string, value: unknown, t: OwnerLeadsTranslate, none: "removed" | "nothing"): string {
  if (value === undefined || (value === null && parseUnitKey(key)?.kind !== "field" && parseUnitKey(key)?.kind !== "spaceField")) {
    return t(none === "removed" ? "checklist.panel.removed" : "checklist.panel.nothing");
  }
  const parsed = parseUnitKey(key);
  const entry = (value ?? {}) as Json;
  const presence = entry.presence === "NO" ? t("checklist.values.yesNo.NO") : t("checklist.values.yesNo.YES");
  switch (parsed?.kind) {
    case "sharedItem":
    case "spaceItem":
      return `${t(`checklist.values.items.${parsed.code as "BED"}`)}: ${presence}`;
    case "otherItem":
      return `${String(entry.label ?? "")}: ${presence}`;
    case "hazard":
      return String(entry.description ?? "");
    case "space":
      return [entry.code, entry.location].filter(Boolean).join(" · ");
    case "hazardList": {
      const list = entry as { state?: string; none?: boolean };
      if (list.state === "VALUE") return list.none ? t("checklist.fields.hazardsNone") : t("checklist.fields.hazardsList");
      return unitText("hazards", value, t);
    }
    default:
      return unitText(fieldOfKey(key) ?? "", value, t);
  }
}

export type CompareRow = { key: string; label: string; savedNow: string; yours: string };

/** One row per edited unit: the value saved now (the newer read) and the user's edit (W16-27). */
export function compareRows(
  edits: Readonly<Record<string, unknown>>,
  stored: ReadonlyMap<string, unknown>,
  codes: ReadonlyMap<string, string>,
  t: OwnerLeadsTranslate,
): CompareRow[] {
  return Object.entries(edits).map(([key, value]) => ({
    key,
    label: unitLabel(key, codes, t),
    savedNow: anyUnitText(key, stored.has(key) ? stored.get(key) : undefined, t, "nothing"),
    yours: anyUnitText(key, value, t, "removed"),
  }));
}
