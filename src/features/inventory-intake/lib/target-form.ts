import { containsPhoneNumber } from "@/lib/text/phone-in-text";

import type { IntakeBlock, IntakeTargetInput, InventorySearchItem, InventorySearchQuery, InventorySearchUnit } from "../types";

import { targetModes } from "./intake-steps";
import { cleanText, QUERY_MAX, type TextProblem, textProblem } from "./intake-text";

// The target step (property-create intake 4.7, 4.8): a new property, or a link to one the owner holds, each selected
// space mapped one to one to a unit of it. The server checks every link again.

export type TargetForm = {
  mode: "" | "CREATE" | "LINK";
  /** The part whose unit takes the property code; PARTS only. */
  canonicalSpaceId: string;
  propertyId: string;
  propertyCode: string;
  units: readonly InventorySearchUnit[];
  /** Space id -> unit id. */
  mappings: Readonly<Record<string, string>>;
};

export type TargetProblems = {
  mode?: "required";
  canonical?: "required";
  property?: "required";
  mappings?: "required" | "overlap";
};

export function initialTarget(block: IntakeBlock): TargetForm {
  const modes = targetModes(block);
  const stored = block.target?.mode;
  const mode = modes.length === 1 ? modes[0] : (stored ?? "");
  return { mode, canonicalSpaceId: block.target?.canonicalSpaceId ?? "", propertyId: "", propertyCode: "", units: [], mappings: {} };
}

/** A new property to link to: its units and nothing of the last one's mappings. */
export function pickProperty(form: TargetForm, item: InventorySearchItem): TargetForm {
  return {
    ...form,
    propertyId: item.propertyId ?? "",
    propertyCode: item.propertyCode ?? "",
    units: item.units ?? [],
    mappings: {},
  };
}

const selectedSpaces = (block: IntakeBlock): readonly string[] => block.selection?.spaceIds ?? [];

/** What is missing before the target can be sent; `{}` when it can. */
export function targetProblems(form: TargetForm, block: IntakeBlock): TargetProblems {
  if (form.mode === "") return { mode: "required" };
  const selected = selectedSpaces(block);
  if (form.mode === "CREATE") {
    const needsMain = block.source?.rentalScope === "PARTS";
    return needsMain && !selected.includes(form.canonicalSpaceId) ? { canonical: "required" } : {};
  }
  if (form.propertyId === "") return { property: "required" };
  const units = selected.map((spaceId) => form.mappings[spaceId] ?? "");
  if (units.some((unitId) => unitId === "")) return { mappings: "required" };
  return new Set(units).size === units.length ? {} : { mappings: "overlap" };
}

/** The body of a checked form: `canonicalSpaceId` only with CREATE, `propertyId` only with LINK. */
export function targetBody(form: TargetForm, block: IntakeBlock): IntakeTargetInput {
  const expectedVersion = block.version ?? undefined;
  if (form.mode === "LINK") {
    const mappings = selectedSpaces(block).map((spaceId) => ({ spaceId, unitId: form.mappings[spaceId] ?? "" }));
    return { mode: "LINK", propertyId: form.propertyId, mappings, expectedVersion };
  }
  const main = block.source?.rentalScope === "PARTS" ? { canonicalSpaceId: form.canonicalSpaceId } : {};
  return { mode: "CREATE", ...main, expectedVersion };
}

/** The text goes into a query string: a phone number must not reach a URL, even to be refused there. */
export function searchProblem(input: { propertyCode: string; q: string }): TextProblem | null {
  const code = input.propertyCode.trim();
  if (code !== "") return containsPhoneNumber(code) ? "phone" : null;
  return cleanText(input.q) === "" ? null : textProblem(input.q, QUERY_MAX);
}

/**
 * The search of the owner's properties (spec 4.7): a code, else text over all their properties, so an older one with no
 * ward code is found, else the lead's ward. Null with nothing to search by.
 */
export function searchQuery(
  input: { propertyCode: string; q: string; page: number },
  wardCode: string | null,
): InventorySearchQuery | null {
  const propertyCode = input.propertyCode.trim();
  if (propertyCode !== "") return { propertyCode };
  const q = cleanText(input.q);
  if (q !== "") return { q, page: input.page };
  return wardCode === null ? null : { wardCode, page: input.page };
}
