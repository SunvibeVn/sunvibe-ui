import type { IntakePreview } from "../types";

import { codeText } from "./code-text";
import { type IntakeKey, labelOf, NOT_CARRIED_LABEL, UNIT_AVAILABILITY_LABEL, WARNING_LABEL } from "./labels";
import { termValueText } from "./term-text";

// What the preview step shows (U-4): sources and dates beside each value, condition and amenities per unit (D5-20), the
// owner state with the masked account, what is not carried, the warnings, and the terms as unconfirmed reference only.

export type PreviewFieldSource = { field: string | null; source: string | null; date: string | null };

export type PreviewUnitView = {
  spaceCode: string | null;
  /** Null when the code is drawn at completion. */
  unitCode: string | null;
  location: string | null;
  areaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  condition: string | null;
  amenities: readonly string[];
  availability: IntakeKey | null;
  sources: readonly PreviewFieldSource[];
};

export type PreviewTermView = {
  name: string | null;
  value: string | null;
  unit: string | null;
  source: string | null;
  date: string | null;
};

export type PreviewView = {
  hash: string | null;
  owner: { masked: string | null; confirmed: boolean; checked: boolean };
  property: {
    code: string | null;
    title: string | null;
    assetType: string | null;
    layout: string | null;
    address: string | null;
    ward: string | null;
  };
  source: { revisionId: string | null; decidedAt: string | null; address: string | null };
  units: readonly PreviewUnitView[];
  /** Apart from the property and its units: nothing here is an accepted term (BR-10). */
  terms: readonly PreviewTermView[];
  notCarried: readonly IntakeKey[];
  warnings: readonly IntakeKey[];
};

const orNull = <T>(value: T | null | undefined): T | null => value ?? null;

/** A value the API may send as a code. */
const words = (value: string | null | undefined): string | null => (value ? codeText(value) : null);

export function previewView(preview: IntakePreview): PreviewView {
  const { owner, property, source } = preview;
  return {
    hash: orNull(preview.previewHash),
    owner: {
      masked: orNull(owner?.accountAddressMasked),
      confirmed: owner?.state === "CONFIRMED",
      checked: owner?.check === "DONE",
    },
    property: {
      code: orNull(property?.code),
      title: orNull(property?.title),
      assetType: orNull(property?.assetType),
      layout: orNull(property?.layout),
      address: orNull(property?.address),
      ward: orNull(property?.ward),
    },
    source: {
      revisionId: orNull(source?.revisionId),
      decidedAt: orNull(source?.decidedAt),
      address: orNull(source?.address),
    },
    units: (preview.units ?? []).map((unit) => ({
      spaceCode: orNull(unit.spaceCode),
      unitCode: orNull(unit.unitCode),
      location: orNull(unit.location),
      areaSqm: orNull(unit.areaSqm),
      bedrooms: orNull(unit.bedrooms),
      bathrooms: orNull(unit.bathrooms),
      condition: words(unit.condition),
      amenities: (unit.amenities ?? []).map(codeText),
      availability: labelOf(UNIT_AVAILABILITY_LABEL, unit.availability),
      sources: (unit.sources ?? []).map((item) => ({
        field: words(item.field),
        source: words(item.source),
        date: orNull(item.date),
      })),
    })),
    terms: (preview.termsReference ?? []).map((term) => ({
      name: words(term.name),
      value: termValueText(term.value),
      unit: orNull(term.unit),
      source: words(term.source),
      date: orNull(term.date),
    })),
    notCarried: (preview.notCarried ?? []).flatMap((item) => labelOf(NOT_CARRIED_LABEL, item) ?? []),
    warnings: (preview.warnings ?? []).flatMap((item) => labelOf(WARNING_LABEL, item) ?? []),
  };
}
