import type { ChecklistGroupPath, ChecklistInput } from "@/features/surveys";

import { parseUnitKey } from "./units";

type Json = Record<string, unknown>;

const indexOf = (list: unknown, match: (entry: Json) => boolean): number =>
  Array.isArray(list) ? (list as Json[]).findIndex(match) : -1;

/**
 * The server's JSON path of a unit in a body (spec 7.3: dots and numeric indexes, `content.spaces.1.area`), so a 400
 * and a page check land on the unit's control; null when the body has no such unit.
 */
export function unitPath<G extends ChecklistGroupPath>(_group: G, input: ChecklistInput[G], key: string): string | null {
  const parsed = parseUnitKey(key);
  if (parsed === null) return null;
  const json = input as unknown as Json;
  const spaceIndex = (spaceId: string) => indexOf(json.spaces, (entry) => entry.spaceId === spaceId);
  const at = (index: number, path: string) => (index < 0 ? null : path.replace("#", String(index)));
  switch (parsed.kind) {
    case "field":
      return `content.${parsed.field}`;
    case "commonTerm":
      return `content.common.${parsed.field}`;
    case "hazardList":
      return "content.hazards";
    case "space":
      return at(spaceIndex(parsed.spaceId), "content.spaces.#");
    case "spaceField":
      return at(spaceIndex(parsed.spaceId), `content.spaces.#.${parsed.field}`);
    case "override":
      return at(spaceIndex(parsed.spaceId), `content.spaces.#.chargeOverrides.${parsed.charge}`);
    case "hazard":
      return at(
        indexOf((json.hazards as Json | undefined)?.value, (entry) => entry.hazardId === parsed.hazardId),
        "content.hazards.value.#",
      );
    case "sharedItem":
      return at(indexOf(json.sharedItems, (entry) => entry.code === parsed.code), "content.sharedItems.#");
    case "otherItem":
      return at(indexOf(json.otherItems, (entry) => entry.itemId === parsed.itemId), "content.otherItems.#");
    case "spaceItem": {
      const space = spaceIndex(parsed.spaceId);
      if (space < 0) return null;
      const items = ((json.spaces as Json[])[space].items ?? []) as Json[];
      return at(indexOf(items, (entry) => entry.code === parsed.code), `content.spaces.${space}.items.#`);
    }
  }
}

/** The problems at or below `path`, with their path relative to it (`value.amount`, `source`, "" for the unit). */
export function problemsUnder<P>(problems: Readonly<Record<string, P>>, path: string | null): Record<string, P> {
  if (path === null) return {};
  const below: Record<string, P> = {};
  for (const [key, problem] of Object.entries(problems)) {
    if (key === path) below[""] = problem;
    else if (key.startsWith(`${path}.`)) below[key.slice(path.length + 1)] = problem;
  }
  return below;
}
