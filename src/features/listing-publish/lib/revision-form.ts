import type { ListingFeatures, ListingRevisionContentBody, ListingRevisionDetail } from "../types";

/**
 * The Draft form's values (listing-publish US-2 AC-1, AC-3, spec section 6): the texts as typed and the thirteen
 * features, an option feature null for "Not stated". No rule of the server is copied here (E06S2-D9, D14, E06S2-P11
 * (1)): the counters are the only check the page makes, and they block nothing.
 */
export type RevisionFormValues = { title: string; description: string; features: ListingFeatures };

/** The thirteen features of the contract only, whatever else a value carries. */
function featuresOf(features: ListingFeatures): ListingFeatures {
  return {
    furnishing: features.furnishing,
    airConditioner: features.airConditioner,
    waterHeater: features.waterHeater,
    fridge: features.fridge,
    washingMachine: features.washingMachine,
    kitchen: features.kitchen,
    balcony: features.balcony,
    elevator: features.elevator,
    motorbikeParking: features.motorbikeParking,
    carParking: features.carParking,
    internet: features.internet,
    pets: features.pets,
    noSharedLandlord: features.noSharedLandlord,
  };
}

/** The form's values from the revision read: the stored texts (normalized by the server) and features. */
export function formValues(detail: ListingRevisionDetail): RevisionFormValues {
  return { title: detail.title ?? "", description: detail.description ?? "", features: featuresOf(detail.features) };
}

/**
 * Whether two form values hold the same texts and features: the form has unsaved changes while what is typed differs
 * from the last read, and a submission sends the stored revision, never the screen.
 */
export function sameValues(a: RevisionFormValues, b: RevisionFormValues): boolean {
  if (a.title !== b.title || a.description !== b.description) return false;
  const first = featuresOf(a.features);
  const second = featuresOf(b.features);
  return (Object.keys(first) as (keyof ListingFeatures)[]).every((name) => first[name] === second[name]);
}

/** Null for an empty or blank text, which the server stores as empty; any other text as typed. */
function textOrNull(text: string): string | null {
  return text.trim() === "" ? null : text;
}

/**
 * The body of a save (E06S2-D4): the whole title, description and features replace the Draft's, so a partial save
 * sends null for what is not written. The server normalizes and checks the text.
 */
export function contentBody(values: RevisionFormValues, dataVersion: number): ListingRevisionContentBody {
  return {
    dataVersion,
    title: textOrNull(values.title),
    description: textOrNull(values.description),
    features: featuresOf(values.features),
  };
}

/**
 * The characters a counter shows: Unicode code points of the NFC text, as the server counts them (E06S2-D4), so an
 * emoji is one and a letter typed with a combining accent is one.
 */
export function codePointCount(text: string): number {
  return [...text.normalize("NFC")].length;
}
