import type { ApiResult } from "@/features/auth/client";
import type en from "@/i18n/messages/en.json";

import type { ListingFeatures, ListingFee, ListingTermsSnapshot, ListingUnitSnapshot } from "../types";

type Messages = typeof en.ListingPublish;

/** Dotted path of every leaf string below a message object. */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

/** A key of the `ListingPublish` namespace; a path that does not exist in en.json fails `npm run typecheck`. */
export type ListingKey = LeafPaths<Messages>;

/** One message of the `ListingPublish` namespace with its values; a value may itself be a message (a fee's unit). */
export type Phrase = { key: ListingKey; values?: Record<string, string | number | Phrase> };

/** The translator of the `ListingPublish` namespace, as `useTranslations` and `createTranslator` give it. */
export type Translate = (key: ListingKey, values?: Record<string, string | number>) => string;

/** The text of a phrase; a value that is itself a phrase is translated first. */
export function phraseText(t: Translate, phrase: Phrase): string {
  if (phrase.values === undefined) return t(phrase.key);
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(phrase.values)) {
    values[name] = typeof value === "object" ? phraseText(t, value) : value;
  }
  return t(phrase.key, values);
}

/** The key of `code` in `table`, or `other` for a code the table does not hold (an own property only). */
function keyOf(table: Readonly<Record<string, ListingKey>>, code: string, other: ListingKey): ListingKey {
  return Object.hasOwn(table, code) ? (table[code] as ListingKey) : other;
}

// Codes to the keys of `ListingPublish.revision` (listing-publish E06-S2, spec section 6, E06S2-D17): every label is
// English (G2 D-48, listing BR-15). `Record` over each generated union: a code without a key fails typecheck; a code
// this UI does not know reads its `OTHER` text, so it is shown and never dropped (E06S1-P9).

/** The thirteen features of listing BR-3 (E06S2-D5), in the form's order. */
export type FeatureName = keyof ListingFeatures;
/** The features answered by one option of a closed list, or not stated (null). */
export type OptionFeature = "furnishing" | "washingMachine" | "kitchen" | "pets";

const FEATURE_LABELS: Record<FeatureName, ListingKey> = {
  furnishing: "revision.features.labels.furnishing",
  airConditioner: "revision.features.labels.airConditioner",
  waterHeater: "revision.features.labels.waterHeater",
  fridge: "revision.features.labels.fridge",
  washingMachine: "revision.features.labels.washingMachine",
  kitchen: "revision.features.labels.kitchen",
  balcony: "revision.features.labels.balcony",
  elevator: "revision.features.labels.elevator",
  motorbikeParking: "revision.features.labels.motorbikeParking",
  carParking: "revision.features.labels.carParking",
  internet: "revision.features.labels.internet",
  pets: "revision.features.labels.pets",
  noSharedLandlord: "revision.features.labels.noSharedLandlord",
};

export const FEATURE_NAMES = Object.keys(FEATURE_LABELS) as FeatureName[];

/** The options of each option feature, in the order the form offers them (before "Not stated"). */
export const OPTION_CODES: { readonly [F in OptionFeature]: readonly NonNullable<ListingFeatures[F]>[] } = {
  furnishing: ["FULL", "BASIC", "NONE"],
  washingMachine: ["PRIVATE", "SHARED"],
  kitchen: ["PRIVATE", "SHARED"],
  pets: ["ALLOWED", "NOT_ALLOWED"],
};

export function isOptionFeature(name: FeatureName): name is OptionFeature {
  return Object.hasOwn(OPTION_CODES, name);
}

type OptionCode = NonNullable<ListingFeatures[OptionFeature]>;

const OPTION_LABELS: Record<OptionCode, ListingKey> = {
  FULL: "revision.features.options.FULL",
  BASIC: "revision.features.options.BASIC",
  NONE: "revision.features.options.NONE",
  PRIVATE: "revision.features.options.PRIVATE",
  SHARED: "revision.features.options.SHARED",
  ALLOWED: "revision.features.options.ALLOWED",
  NOT_ALLOWED: "revision.features.options.NOT_ALLOWED",
};

type AssetTypeCode = NonNullable<ListingUnitSnapshot["assetType"]>;
type ChargeUnitCode = NonNullable<ListingFee["chargeUnit"]>;
type SourceCode = ListingTermsSnapshot["source"];

const ASSET_TYPES: Record<AssetTypeCode, ListingKey> = {
  HOUSE: "revision.unit.assetTypes.HOUSE",
  WHOLE_BUILDING: "revision.unit.assetTypes.WHOLE_BUILDING",
  VILLA: "revision.unit.assetTypes.VILLA",
  HOMESTAY: "revision.unit.assetTypes.HOMESTAY",
  CONDOTEL: "revision.unit.assetTypes.CONDOTEL",
  APARTMENT: "revision.unit.assetTypes.APARTMENT",
};

const CHARGE_UNITS: Record<ChargeUnitCode, ListingKey> = {
  PER_MONTH: "revision.terms.units.PER_MONTH",
  PER_KWH: "revision.terms.units.PER_KWH",
  PER_M3: "revision.terms.units.PER_M3",
  PER_PERSON_PER_MONTH: "revision.terms.units.PER_PERSON_PER_MONTH",
  PER_VEHICLE_PER_MONTH: "revision.terms.units.PER_VEHICLE_PER_MONTH",
  ONE_OFF: "revision.terms.units.ONE_OFF",
};

const SOURCES: Record<SourceCode, ListingKey> = {
  IN_EFFECT: "revision.terms.sources.IN_EFFECT",
  PENDING_START: "revision.terms.sources.PENDING_START",
};

/** A feature's English label: "Air conditioner". */
export function featureLabelKey(name: FeatureName): ListingKey {
  return FEATURE_LABELS[name];
}

/** An option's English label; null reads "Not stated", an unknown code "Another choice". */
export function optionLabelKey(code: string | null): ListingKey {
  if (code === null) return "revision.features.options.notStated";
  return keyOf(OPTION_LABELS, code, "revision.features.options.OTHER");
}

/** The property type of the unit snapshot (D-47's six types), or "Another type". */
export function assetTypeKey(code: string): ListingKey {
  return keyOf(ASSET_TYPES, code, "revision.unit.assetTypes.OTHER");
}

/** The charge unit of a fee amount: "per kWh", or "per another unit". */
export function chargeUnitKey(code: string): ListingKey {
  return keyOf(CHARGE_UNITS, code, "revision.terms.units.OTHER");
}

/** Where a terms snapshot comes from; the pending one takes the value `date`. */
export function sourceKey(code: string): ListingKey {
  return keyOf(SOURCES, code, "revision.terms.sources.OTHER");
}

const WHOLE_VND = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * A whole amount of VND with comma groups: "8,000,000" (ADR-006, E06S2-P11 (5)). Every amount of the contract is at
 * most 999,999,999,999,999, below 2^53, so the number is exact.
 */
export function wholeVnd(amount: number): string {
  return WHOLE_VND.format(amount);
}

// The answers of a command (spec section 6, the answer table). Read by status, `code` and the entries' `field`, never
// by message (ADR-010).

/** The answers that show a sentence in the panel's alert: twelve rows and the 422's lead sentence. */
export const REVISION_ANSWERS = [
  "validationTitle",
  "validationDescription",
  "validationOther",
  "forbidden",
  "notFound",
  "archived",
  "concurrent",
  "notDraft",
  "notPending",
  "openExists",
  "termsAbsent",
  "notSubmittable",
  "failed",
] as const;

export type RevisionAnswer = (typeof REVISION_ANSWERS)[number];

const ANSWER_KEYS: Record<RevisionAnswer, ListingKey> = {
  validationTitle: "revision.answers.validationTitle",
  validationDescription: "revision.answers.validationDescription",
  validationOther: "revision.answers.validationOther",
  forbidden: "revision.answers.forbidden",
  notFound: "revision.answers.notFound",
  archived: "revision.answers.archived",
  concurrent: "revision.answers.concurrent",
  notDraft: "revision.answers.notDraft",
  notPending: "revision.answers.notPending",
  openExists: "revision.answers.openExists",
  termsAbsent: "revision.answers.termsAbsent",
  notSubmittable: "revision.answers.notSubmittable",
  failed: "revision.answers.failed",
};

/** The 409 codes of the five commands (spec section 4) and their answers; another 409 code is a failure. */
const CONFLICTS: Readonly<Record<string, RevisionAnswer>> = {
  LISTING_ARCHIVED: "archived",
  CONCURRENT_MODIFICATION: "concurrent",
  REVISION_NOT_DRAFT: "notDraft",
  REVISION_NOT_PENDING: "notPending",
  OPEN_REVISION_EXISTS: "openExists",
  TERMS_SOURCE_ABSENT: "termsAbsent",
};

/** The sentence of an answer, a key of `ListingPublish`. */
export function answerKey(answer: RevisionAnswer): ListingKey {
  return ANSWER_KEYS[answer];
}

/**
 * The answer of a command's result (spec section 6): null for a success and for the session answers (signed out,
 * unavailable), which show nothing, as E06-S1's view (E06S1-P8). A 400 reads its entries: on a save, the `title` entry
 * and then the `description` entry have their own sentences; any other 400 reads "Reload the page". 403 and 404 by
 * status; 409 by `code`; 422 `REVISION_NOT_SUBMITTABLE`; anything else, no answer included, "Something went wrong".
 */
export function answerOf(result: ApiResult<unknown>, command: "save" | "other"): RevisionAnswer | null {
  if (result.ok || result.kind === "signed-out" || result.kind === "unavailable") return null;
  if (result.kind !== "http") return "failed";
  switch (result.status) {
    case 400: {
      if (command === "save") {
        const fields = result.fieldErrors.map((entry) => entry.field);
        if (fields.includes("title")) return "validationTitle";
        if (fields.includes("description")) return "validationDescription";
      }
      return "validationOther";
    }
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return result.code !== undefined && Object.hasOwn(CONFLICTS, result.code) ? (CONFLICTS[result.code] as RevisionAnswer) : "failed";
    case 422:
      return result.code === "REVISION_NOT_SUBMITTABLE" ? "notSubmittable" : "failed";
    default:
      return "failed";
  }
}

/**
 * A problem of the revision read or a 422 entry: its part and rule as the server names them, and for a fee name the
 * fee's 1-based position in the terms snapshot (E06S7-D16 (b); null or absent otherwise). A form this UI does not know
 * is kept as it came, so it reads the unknown sentence and is never dropped.
 */
export type RevisionProblem = { part: string; rule: string; position?: number | null };

const PART_CODES: Readonly<Record<string, string>> = { title: "TITLE", description: "DESCRIPTION", terms: "TERMS" };

/** A fee name's entry, `feeName.<position>.<RULE>` (`feeName.2.PHONE_NUMBER`), its position in canonical decimal form. */
const FEE_NAME_FIELD = /^feeName\.([1-9][0-9]{0,8})\.(.+)$/;

/**
 * The 422 entries' fields, `<part in lower camel>.<rule>` (`title.PHONE_NUMBER`) or a fee name's
 * `feeName.<position>.<RULE>`, as problems in their order.
 */
export function problemsOf(fieldErrors: readonly { field: string }[]): RevisionProblem[] {
  return fieldErrors.map(({ field }) => {
    const fee = FEE_NAME_FIELD.exec(field);
    if (fee !== null) return { part: "FEE_NAME", rule: fee[2] as string, position: Number(fee[1]) };
    const dot = field.indexOf(".");
    const part = dot < 0 ? field : field.slice(0, dot);
    const rule = dot < 0 ? "" : field.slice(dot + 1);
    return { part: Object.hasOwn(PART_CODES, part) ? (PART_CODES[part] as string) : part, rule };
  });
}

/** The length and presence rules (listing-publish BR-2, BR-4): one sentence per part and rule. */
const PART_RULES: Readonly<Record<string, Readonly<Record<string, ListingKey>>>> = {
  TITLE: {
    REQUIRED: "revision.problems.TITLE.REQUIRED",
    TOO_SHORT: "revision.problems.TITLE.TOO_SHORT",
    TOO_LONG: "revision.problems.TITLE.TOO_LONG",
  },
  DESCRIPTION: {
    REQUIRED: "revision.problems.DESCRIPTION.REQUIRED",
    TOO_SHORT: "revision.problems.DESCRIPTION.TOO_SHORT",
    TOO_LONG: "revision.problems.DESCRIPTION.TOO_LONG",
  },
  TERMS: { REQUIRED: "revision.problems.TERMS.REQUIRED" },
};

/** The machine check of the title and the description (listing BR-11, E06S2-D8): the part is the value `part`. */
const MACHINE_RULES: Readonly<Record<string, ListingKey>> = {
  PHONE_NUMBER: "revision.problems.PHONE_NUMBER",
  EMAIL: "revision.problems.EMAIL",
  LINK: "revision.problems.LINK",
  SOCIAL_HANDLE: "revision.problems.SOCIAL_HANDLE",
  FORBIDDEN_WORD: "revision.problems.FORBIDDEN_WORD",
};

const MACHINE_PARTS = new Set(["TITLE", "DESCRIPTION"]);

/**
 * The machine check of a fee name (listing-publish BR-2 with LP-15, E-20, E06S7-D16 (b)): one sentence per rule, with
 * the fee's position and the remedy. Only the machine rules apply to a fee name; its length is E05's.
 */
const FEE_NAME_RULES: Readonly<Record<string, ListingKey>> = {
  PHONE_NUMBER: "revision.problems.FEE_NAME.PHONE_NUMBER",
  EMAIL: "revision.problems.FEE_NAME.EMAIL",
  LINK: "revision.problems.FEE_NAME.LINK",
  SOCIAL_HANDLE: "revision.problems.FEE_NAME.SOCIAL_HANDLE",
  FORBIDDEN_WORD: "revision.problems.FEE_NAME.FORBIDDEN_WORD",
};

/**
 * The sentence of a problem (spec section 6); it never quotes the text that matched, which the server does not
 * answer. An unknown part or rule, a rule its part does not have, or a fee name without its position, reads "This
 * revision breaks a rule this page does not know yet."
 */
export function problemSentence(problem: RevisionProblem): Phrase {
  const rules = Object.hasOwn(PART_RULES, problem.part) ? PART_RULES[problem.part] : undefined;
  if (rules !== undefined && Object.hasOwn(rules, problem.rule)) return { key: rules[problem.rule] as ListingKey };
  if (MACHINE_PARTS.has(problem.part) && Object.hasOwn(MACHINE_RULES, problem.rule)) {
    return { key: MACHINE_RULES[problem.rule] as ListingKey, values: { part: problem.part } };
  }
  const position = problem.position;
  if (problem.part === "FEE_NAME" && typeof position === "number" && Object.hasOwn(FEE_NAME_RULES, problem.rule)) {
    return { key: FEE_NAME_RULES[problem.rule] as ListingKey, values: { position } };
  }
  return { key: "revision.problems.unknown" };
}
