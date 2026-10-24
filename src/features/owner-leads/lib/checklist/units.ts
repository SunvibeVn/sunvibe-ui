import type { ChecklistGroupPath } from "@/features/surveys";

// Unit keys of the checklist (survey-checklist spec 4.5, plan Task A6, A-29): one stable key per provenance unit,
// built from ids, never from a label or a description. The server returns the same keys in `corrections[].units`.

/** The five charges that may differ per space (`chargeOverrides`) and their common values. */
export const CHARGES = ["electricity", "water", "internet", "parking", "serviceFee"] as const;
export type Charge = (typeof CHARGES)[number];

/** The nine common rental terms of G8, in form order. */
export const COMMON_TERMS = [...CHARGES, "otherFees", "houseRules", "pets", "handoverMaintenance"] as const;
export type CommonTerm = (typeof COMMON_TERMS)[number];

export const unitKey = {
  /** An asset-level field: `parts/accessRoute`. */
  field: (group: ChecklistGroupPath, field: string) => `${group}/${field}`,
  /** A field of one space: `dimensions/spaces/<spaceId>/area`. */
  spaceField: (group: ChecklistGroupPath, spaceId: string, field: string) => `${group}/spaces/${spaceId}/${field}`,
  /** An observed space of G1. */
  space: (spaceId: string) => `identification/spaces/${spaceId}`,
  /** The hazard list wrapper (its state: unknown, "none seen" or a list). */
  hazardList: "safety/hazards",
  hazard: (hazardId: string) => `safety/hazards/${hazardId}`,
  sharedItem: (code: string) => `amenities/sharedItems/${code}`,
  spaceItem: (spaceId: string, code: string) => `amenities/spaces/${spaceId}/items/${code}`,
  otherItem: (itemId: string) => `amenities/otherItems/${itemId}`,
  commonTerm: (field: string) => `terms/common/${field}`,
  override: (spaceId: string, charge: string) => `terms/spaces/${spaceId}/chargeOverrides/${charge}`,
} as const;

export type ParsedUnitKey =
  | { kind: "field"; group: ChecklistGroupPath; field: string }
  | { kind: "spaceField"; group: ChecklistGroupPath; spaceId: string; field: string }
  | { kind: "space"; spaceId: string }
  | { kind: "hazardList" }
  | { kind: "hazard"; hazardId: string }
  | { kind: "sharedItem"; code: string }
  | { kind: "spaceItem"; spaceId: string; code: string }
  | { kind: "otherItem"; itemId: string }
  | { kind: "commonTerm"; field: string }
  | { kind: "override"; spaceId: string; charge: string };

const GROUPS: readonly string[] = ["identification", "parts", "dimensions", "condition", "safety", "amenities", "terms"];

/** The parts of a unit key, or null for a text that is not one. */
export function parseUnitKey(key: string): ParsedUnitKey | null {
  const parts = key.split("/");
  const [group] = parts;
  if (!GROUPS.includes(group) || parts.some((part) => part === "")) return null;
  const path = group as ChecklistGroupPath;
  if (parts.length === 2) {
    if (key === unitKey.hazardList) return { kind: "hazardList" };
    return { kind: "field", group: path, field: parts[1] };
  }
  if (group === "identification" && parts.length === 3 && parts[1] === "spaces") return { kind: "space", spaceId: parts[2] };
  if (group === "safety" && parts.length === 3 && parts[1] === "hazards") return { kind: "hazard", hazardId: parts[2] };
  if (group === "amenities" && parts.length === 3 && parts[1] === "sharedItems") return { kind: "sharedItem", code: parts[2] };
  if (group === "amenities" && parts.length === 3 && parts[1] === "otherItems") return { kind: "otherItem", itemId: parts[2] };
  if (group === "terms" && parts.length === 3 && parts[1] === "common") return { kind: "commonTerm", field: parts[2] };
  if (parts[1] !== "spaces") return null;
  if (parts.length === 4) return { kind: "spaceField", group: path, spaceId: parts[2], field: parts[3] };
  if (group === "amenities" && parts.length === 5 && parts[3] === "items") {
    return { kind: "spaceItem", spaceId: parts[2], code: parts[4] };
  }
  if (group === "terms" && parts.length === 5 && parts[3] === "chargeOverrides") {
    return { kind: "override", spaceId: parts[2], charge: parts[4] };
  }
  return null;
}

/** The space a unit key belongs to, or null for an asset-level unit (other items are keyed by their own id). */
export function spaceIdOfKey(key: string): string | null {
  const parsed = parseUnitKey(key);
  if (parsed === null) return null;
  return "spaceId" in parsed ? parsed.spaceId : null;
}

/** The field name a unit key ends with (`area`, `kitchen`, `electricity`), the entry kind for list entries. */
export function fieldOfKey(key: string): string | null {
  const parsed = parseUnitKey(key);
  if (parsed === null) return null;
  switch (parsed.kind) {
    case "field":
    case "spaceField":
    case "commonTerm":
      return parsed.field;
    case "override":
      return parsed.charge;
    case "space":
      return "spaces";
    case "hazardList":
    case "hazard":
      return "hazards";
    default:
      return "items";
  }
}
