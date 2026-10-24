import type {
  ChecklistAmenityItem,
  ChecklistAmenityItemInput,
  ChecklistContent,
  ChecklistGroupPath,
  ChecklistHazard,
  ChecklistHazardInput,
  ChecklistInput,
  ChecklistOtherItem,
  ChecklistOtherItemInput,
} from "@/features/surveys";

import { CHARGES, COMMON_TERMS, parseUnitKey, unitKey } from "./units";

// The request body of a group save (survey-checklist A-4, spec 6.2 Drafts): the latest loaded content without `meta`
// and server fields, every input key present, plus the user's edits keyed by unit key.

export type RentalScope = "WHOLE" | "PARTS";

/** What the per-space lists and the PARTS-only units follow: the G1 spaces in order and the G1 scope. */
export type GroupContext = { spaces: readonly string[]; scope: RentalScope | null };

/** A unit's value in input form: a wrapper, a plain value, a note, or an entry. */
export type UnitValue = unknown;

/** The user's edits of one group, by unit key. For a list entry (space, hazard, item) `null` means removed. */
export type GroupEdits = Record<string, UnitValue>;

type State = "UNKNOWN" | "VALUE" | "NOT_APPLICABLE";
type Wrapper = {
  state?: State;
  value?: unknown;
  naReason?: string | null;
  source?: string | null;
  confirmedOn?: string | null;
  receivedByUserId?: string | null;
  relayBasis?: string | null;
};

const plainIn = (wrapper: Wrapper | null | undefined) => ({
  state: wrapper?.state ?? "UNKNOWN",
  value: wrapper?.value ?? null,
  naReason: wrapper?.naReason ?? null,
});

const sourcedIn = (wrapper: Wrapper | null | undefined) => ({
  ...plainIn(wrapper),
  source: wrapper?.source ?? null,
  confirmedOn: wrapper?.confirmedOn ?? null,
  receivedByUserId: wrapper?.receivedByUserId ?? null,
  relayBasis: wrapper?.relayBasis ?? null,
});

/** A per-space OWNER_FORM value exists only in WHOLE scope (A-18): elsewhere it reads as unknown (A-12, PD-4). */
const formGuard = (wrapper: Wrapper | null | undefined, ctx: GroupContext) =>
  ctx.scope !== "WHOLE" && wrapper?.source === "OWNER_FORM" ? sourcedIn(null) : sourcedIn(wrapper);

/** One entry per G1 space in G1 order: the stored one, or an empty one for a space it has none for (PD-5). */
function perSpace<S extends { spaceId?: string }, T>(
  ctx: GroupContext,
  stored: readonly S[] | null | undefined,
  build: (entry: S | undefined, spaceId: string) => T,
): T[] {
  return ctx.spaces.map((spaceId) => build((stored ?? []).find((entry) => entry.spaceId === spaceId), spaceId));
}

const itemIn = (item: ChecklistAmenityItem): ChecklistAmenityItemInput => ({
  code: item.code as ChecklistAmenityItemInput["code"],
  presence: item.presence ?? "YES",
  source: item.source ?? "OBSERVED_ON_SITE",
  confirmedOn: item.confirmedOn ?? null,
  receivedByUserId: item.receivedByUserId ?? null,
  relayBasis: item.relayBasis ?? null,
});

const otherIn = (item: ChecklistOtherItem): ChecklistOtherItemInput => ({
  itemId: item.itemId ?? "",
  label: item.label ?? "",
  spaceId: item.spaceId ?? null,
  presence: item.presence ?? "YES",
  source: item.source ?? "OBSERVED_ON_SITE",
  confirmedOn: item.confirmedOn ?? null,
  receivedByUserId: item.receivedByUserId ?? null,
  relayBasis: item.relayBasis ?? null,
});

const hazardIn = (hazard: ChecklistHazard, ctx: GroupContext): ChecklistHazardInput => ({
  hazardId: hazard.hazardId ?? "",
  // A hazard of a space G1 no longer has stays, detached at asset level (A-12).
  spaceId: hazard.spaceId && ctx.spaces.includes(hazard.spaceId) ? hazard.spaceId : null,
  previous: hazard.previous ?? null,
  description: hazard.description ?? "",
  severity: hazard.severity ?? "UNCLASSIFIED",
  status: hazard.status ?? "OPEN",
  statusNote: hazard.statusNote ?? null,
  ownerReportedOn: hazard.ownerReportedOn ?? null,
  receivedByUserId: hazard.receivedByUserId ?? null,
  relayBasis: hazard.relayBasis ?? null,
});


type Builders = { [G in ChecklistGroupPath]: (content: ChecklistContent[G], ctx: GroupContext) => ChecklistInput[G] };

const BUILD: Builders = {
  identification: (c) => ({
    observedAddress: sourcedIn(c.observedAddress) as never,
    differenceNote: c.differenceNote ?? null,
    propertyType: plainIn(c.propertyType) as never,
    fit: plainIn(c.fit) as never,
    rentalScope: c.rentalScope ?? null,
    spaces: (c.spaces ?? []).map((space) => ({
      spaceId: space.spaceId ?? "",
      code: space.code ?? "",
      location: space.location ?? "",
      description: space.description ?? null,
    })),
    otherPartsNote: c.otherPartsNote ?? null,
    generalNote: c.generalNote ?? null,
  }),
  parts: (c, ctx) => ({
    accessRoute: plainIn(c.accessRoute) as never,
    sharedAreas: plainIn(c.sharedAreas) as never,
    totalFloors: sourcedIn(c.totalFloors) as never,
    spaces: perSpace(ctx, c.spaces, (space, spaceId) => ({
      spaceId,
      floor: plainIn(space?.floor) as never,
      privateAreas: plainIn(space?.privateAreas) as never,
      actualAccess: plainIn(space?.actualAccess) as never,
    })),
  }),
  dimensions: (c, ctx) => ({
    spaces: perSpace(ctx, c.spaces, (space, spaceId) => ({
      spaceId,
      area: sourcedIn(space?.area) as never,
      bedrooms: sourcedIn(space?.bedrooms) as never,
      privateBathrooms: sourcedIn(space?.privateBathrooms) as never,
      sharedBathroomUse: sourcedIn(space?.sharedBathroomUse) as never,
      layoutNote: space?.layoutNote ?? null,
    })),
  }),
  condition: (c, ctx) => {
    const parts = ctx.scope === "PARTS";
    return {
      // Shared wet areas are asked only in PARTS, where null is refused (spec 4.6).
      sharedKitchen: parts ? (plainIn(c.sharedKitchen) as never) : null,
      sharedBathroom: parts ? (plainIn(c.sharedBathroom) as never) : null,
      spaces: perSpace(ctx, c.spaces, (space, spaceId) => ({
        spaceId,
        occupancy: plainIn(space?.occupancy) as never,
        expectedVacantFrom: sourcedIn(space?.expectedVacantFrom) as never,
        availableFrom: formGuard(space?.availableFrom, ctx) as never,
        mainSpace: plainIn(space?.mainSpace) as never,
        kitchen: plainIn(space?.kitchen) as never,
        bathroom: plainIn(space?.bathroom) as never,
      })),
    };
  },
  safety: (c, ctx) => {
    const state = c.hazards?.state ?? "UNKNOWN";
    return {
      egress: plainIn(c.egress) as never,
      accessRestrictions: plainIn(c.accessRestrictions) as never,
      hazards: {
        state,
        value: state === "VALUE" ? (c.hazards?.value ?? []).map((hazard) => hazardIn(hazard, ctx)) : null,
        naReason: c.hazards?.naReason ?? null,
      },
    };
  },
  amenities: (c, ctx) => ({
    sharedItems: (c.sharedItems ?? []).map(itemIn),
    spaces: perSpace(ctx, c.spaces, (space, spaceId) => ({
      spaceId,
      furnishing: sourcedIn(space?.furnishing) as never,
      items: (space?.items ?? []).map(itemIn),
    })),
    // Other items of a space G1 no longer has go with it (A-12).
    otherItems: (c.otherItems ?? [])
      .filter((item) => !item.spaceId || ctx.spaces.includes(item.spaceId))
      .map(otherIn),
  }),
  terms: (c, ctx) => {
    const parts = ctx.scope === "PARTS";
    const common = c.common ?? {};
    return {
      common: Object.fromEntries(COMMON_TERMS.map((field) => [field, sourcedIn(common[field])])) as never,
      spaces: perSpace(ctx, c.spaces, (space, spaceId) => ({
        spaceId,
        monthlyRent: formGuard(space?.monthlyRent, ctx) as never,
        deposit: sourcedIn(space?.deposit) as never,
        paymentPeriodMonths: sourcedIn(space?.paymentPeriodMonths) as never,
        minimumTermMonths: sourcedIn(space?.minimumTermMonths) as never,
        // PARTS only: five members, each null (= the common value) or a term (spec 4.6); null outside PARTS.
        chargeOverrides: parts
          ? (Object.fromEntries(
              CHARGES.map((charge) => {
                const member = space?.chargeOverrides?.[charge];
                return [charge, member ? sourcedIn(member) : null];
              }),
            ) as never)
          : null,
        spaceFees: parts && space?.spaceFees ? (sourcedIn(space.spaceFees) as never) : null,
      })),
    };
  },
};

/** The stored content of a group in input form (no `meta`, no server field), for the G1 spaces and scope of `ctx`. */
export function inputOfContent<G extends ChecklistGroupPath>(
  group: G,
  content: ChecklistContent[G] | undefined,
  ctx: GroupContext,
): ChecklistInput[G] {
  const build = BUILD[group] as (c: ChecklistContent[G], context: GroupContext) => ChecklistInput[G];
  return structuredClone(build((content ?? {}) as ChecklistContent[G], ctx));
}

type Json = Record<string, unknown>;
type Entry = Json & { spaceId?: string };

function upsert(list: Json[], match: (entry: Json) => boolean, value: UnitValue): void {
  const index = list.findIndex(match);
  if (value === null) {
    if (index >= 0) list.splice(index, 1);
  } else if (index >= 0) {
    list[index] = structuredClone(value) as Json;
  } else {
    list.push(structuredClone(value) as Json);
  }
}

/** Puts one unit's value into an input, in place. Units of a space the input has no entry for are skipped. */
function setUnit(input: Json, key: string, value: UnitValue): void {
  const parsed = parseUnitKey(key);
  if (parsed === null) return;
  const spaces = (input.spaces ?? []) as Entry[];
  const space = (spaceId: string) => spaces.find((entry) => entry.spaceId === spaceId);
  switch (parsed.kind) {
    case "field":
      input[parsed.field] = structuredClone(value);
      return;
    case "commonTerm":
      (input.common as Json)[parsed.field] = structuredClone(value);
      return;
    case "spaceField": {
      const entry = space(parsed.spaceId);
      if (entry) entry[parsed.field] = structuredClone(value);
      return;
    }
    case "override": {
      const overrides = space(parsed.spaceId)?.chargeOverrides as Json | null | undefined;
      if (overrides) overrides[parsed.charge] = structuredClone(value);
      return;
    }
    case "space":
      upsert(spaces, (entry) => entry.spaceId === parsed.spaceId, value);
      return;
    case "hazardList": {
      const list = input.hazards as Json;
      const next = (value ?? {}) as { state?: State; naReason?: string | null };
      list.state = next.state ?? "UNKNOWN";
      list.naReason = next.naReason ?? null;
      list.value = list.state === "VALUE" ? (list.value ?? []) : null;
      return;
    }
    case "hazard": {
      const list = input.hazards as Json;
      if (list.state !== "VALUE") {
        if (value === null) return;
        list.state = "VALUE";
        list.naReason = null;
        list.value = [];
      }
      upsert(list.value as Json[], (entry) => entry.hazardId === parsed.hazardId, value);
      return;
    }
    case "sharedItem":
      upsert(input.sharedItems as Json[], (entry) => entry.code === parsed.code, value);
      return;
    case "spaceItem": {
      const entry = space(parsed.spaceId);
      if (entry) upsert(entry.items as Json[], (item) => item.code === parsed.code, value);
      return;
    }
    case "otherItem":
      upsert(input.otherItems as Json[], (entry) => entry.itemId === parsed.itemId, value);
      return;
  }
}

/**
 * The body content of a group save: the loaded content in input form plus the edits, every input key present, no
 * `meta`, server field or `source` on an unsourced wrapper (A-4, W16-27).
 */
export function toGroupInput<G extends ChecklistGroupPath>(
  group: G,
  content: ChecklistContent[G] | undefined,
  edits: GroupEdits,
  ctx: GroupContext,
): ChecklistInput[G] {
  const input = inputOfContent(group, content, ctx) as unknown as Json;
  for (const [key, value] of Object.entries(edits)) setUnit(input, key, value);
  return input as unknown as ChecklistInput[G];
}

const SPACE_FIELDS: Partial<Record<ChecklistGroupPath, readonly string[]>> = {
  parts: ["floor", "privateAreas", "actualAccess"],
  dimensions: ["area", "bedrooms", "privateBathrooms", "sharedBathroomUse", "layoutNote"],
  condition: ["occupancy", "expectedVacantFrom", "availableFrom", "mainSpace", "kitchen", "bathroom"],
  amenities: ["furnishing"],
  terms: ["monthlyRent", "deposit", "paymentPeriodMonths", "minimumTermMonths", "spaceFees"],
};

const ASSET_FIELDS: Partial<Record<ChecklistGroupPath, readonly string[]>> = {
  identification: ["observedAddress", "propertyType", "fit", "rentalScope", "differenceNote", "otherPartsNote", "generalNote"],
  parts: ["accessRoute", "sharedAreas", "totalFloors"],
  condition: ["sharedKitchen", "sharedBathroom"],
  safety: ["egress", "accessRestrictions"],
};

/**
 * Every unit of a group input by unit key, in form order. The hazard list wrapper reads as `{state, naReason, none}`
 * (`none`: a recorded "none seen"); list entries by their identity (A-29).
 */
export function unitsOfInput<G extends ChecklistGroupPath>(group: G, input: ChecklistInput[G]): Map<string, UnitValue> {
  const units = new Map<string, UnitValue>();
  const json = input as unknown as Json;
  for (const field of ASSET_FIELDS[group] ?? []) units.set(unitKey.field(group, field), json[field] ?? null);
  if (group === "identification") {
    for (const space of (json.spaces ?? []) as Entry[]) units.set(unitKey.space(space.spaceId ?? ""), space);
    return units;
  }
  if (group === "safety") {
    const list = json.hazards as { state: State; naReason: string | null; value: Json[] | null };
    units.set(unitKey.hazardList, {
      state: list.state,
      naReason: list.naReason,
      none: list.state === "VALUE" && (list.value ?? []).length === 0,
    });
    for (const hazard of list.value ?? []) units.set(unitKey.hazard(String(hazard.hazardId)), hazard);
    return units;
  }
  if (group === "amenities") {
    for (const item of (json.sharedItems ?? []) as Json[]) units.set(unitKey.sharedItem(String(item.code)), item);
  }
  if (group === "terms") {
    const common = json.common as Json;
    for (const field of COMMON_TERMS) units.set(unitKey.commonTerm(field), common[field] ?? null);
  }
  for (const space of (json.spaces ?? []) as Entry[]) {
    const spaceId = space.spaceId ?? "";
    for (const field of SPACE_FIELDS[group] ?? []) units.set(unitKey.spaceField(group, spaceId, field), space[field] ?? null);
    if (group === "amenities") {
      for (const item of (space.items ?? []) as Json[]) units.set(unitKey.spaceItem(spaceId, String(item.code)), item);
    }
    if (group === "terms") {
      const overrides = space.chargeOverrides as Json | null;
      for (const charge of CHARGES) units.set(unitKey.override(spaceId, charge), overrides?.[charge] ?? null);
    }
  }
  if (group === "amenities") {
    for (const item of (json.otherItems ?? []) as Json[]) units.set(unitKey.otherItem(String(item.itemId)), item);
  }
  return units;
}

/** One unit of a group input, or undefined when the input has no such unit. */
export function readUnit<G extends ChecklistGroupPath>(group: G, input: ChecklistInput[G], key: string): UnitValue {
  return unitsOfInput(group, input).get(key);
}
