import type { ListingPublicPreview } from "../types";

import { formatCalendarDate } from "./freshness-model";
import { transactionTypeKey } from "./listing-text";
import { revisionPanelModel, termsLines } from "./revision-model";
import { assetTypeKey, type ListingKey, type Phrase } from "./revision-text";

/** One value of the preview, shown as text only: the code and the Sale's texts as typed, never HTML or a link. */
export type PreviewValue =
  | { kind: "text"; text: string }
  /** The description, as typed, its line breaks kept. */
  | { kind: "paragraphs"; text: string }
  | { kind: "phrase"; phrase: Phrase }
  | { kind: "lines"; lines: Phrase[] }
  /** The terms snapshot's lines, as the revision shows them; null before a snapshot is taken. */
  | { kind: "terms"; lines: Phrase[] | null };

/** One group of listing-publish BR-14 as the preview lists it: an English label and the revision's value. */
export type PreviewRow = { labelKey: ListingKey; value: PreviewValue };

const NOT_WRITTEN: PreviewValue = { kind: "phrase", phrase: { key: "revision.notWritten" } };

function phrase(key: ListingKey): PreviewValue {
  return { kind: "phrase", phrase: { key } };
}

function numberValue(value: number): PreviewValue {
  return { kind: "phrase", phrase: { key: "preview.number", values: { value } } };
}

/** A calendar day of the answer (`YYYY-MM-DD`, already in Vietnam time), or the sentence for its absence. */
function dayValue(date: string | null, none: ListingKey): PreviewValue {
  return date === null ? phrase(none) : { kind: "text", text: formatCalendarDate(date) };
}

/**
 * The chosen features with the labels the revision panel uses, read through the panel's own model of a revision (as
 * the live difference does), so the preview and the revision never list them differently.
 */
function featureLines(preview: ListingPublicPreview): Phrase[] {
  const panel = revisionPanelModel(
    {
      ok: true,
      status: 200,
      replayed: false,
      data: {
        listingId: "",
        revisionNo: preview.revisionNo,
        status: preview.revisionStatus,
        createdAt: "",
        updatedAt: "",
        title: null,
        description: null,
        features: preview.features,
        termsSnapshot: null,
        unitSnapshot: null,
        submittedAt: null,
        dataVersion: 0,
        problems: [],
      },
    },
    { openRevisionNo: null, dataVersion: 0, viewerMayDraft: false },
  );
  return panel.kind === "ready" ? panel.screen.features : [];
}

/**
 * Type, place, rooms and area, from the revision's unit snapshot taken at submission; before it, one sentence in their
 * place. The place shows the snapshot's names, each followed by its code, ward first.
 */
function unitRows(preview: ListingPublicPreview): PreviewRow[] {
  const { bedrooms, bathrooms, areaSqm } = preview;
  if (bedrooms === null || bathrooms === null || areaSqm === null) {
    return [{ labelKey: "preview.labels.unit", value: phrase("preview.noUnit") }];
  }
  const { wardName, wardCode, provinceName, provinceCode } = preview;
  const place: Phrase =
    wardName !== null && wardCode !== null && provinceName !== null && provinceCode !== null
      ? { key: "preview.place", values: { ward: wardName, wardCode, province: provinceName, provinceCode } }
      : { key: "preview.noPlace" };
  return [
    { labelKey: "preview.labels.type", value: phrase(preview.propertyType === null ? "preview.noType" : assetTypeKey(preview.propertyType)) },
    { labelKey: "preview.labels.place", value: { kind: "phrase", phrase: place } },
    { labelKey: "preview.labels.bedrooms", value: numberValue(bedrooms) },
    { labelKey: "preview.labels.bathrooms", value: numberValue(bathrooms) },
    { labelKey: "preview.labels.area", value: numberValue(areaSqm) },
  ];
}

/**
 * The public data of a revision as it would be published (listing-publish US-2 AC-3, spec section 6, E06S7-D16 (a)):
 * the groups of BR-14 in their order, English labels and the revision's own text as typed. It shows data only: the
 * publication section says whether the display conditions hold.
 */
export function publicPreviewModel(preview: ListingPublicPreview): PreviewRow[] {
  const features = featureLines(preview);
  return [
    { labelKey: "preview.labels.code", value: { kind: "text", text: preview.code } },
    { labelKey: "preview.labels.rental", value: phrase(transactionTypeKey(preview.transactionType)) },
    ...unitRows(preview),
    { labelKey: "preview.labels.terms", value: { kind: "terms", lines: preview.terms === null ? null : termsLines(preview.terms) } },
    { labelKey: "preview.labels.title", value: preview.title === null ? NOT_WRITTEN : { kind: "text", text: preview.title } },
    {
      labelKey: "preview.labels.description",
      value: preview.description === null ? NOT_WRITTEN : { kind: "paragraphs", text: preview.description },
    },
    { labelKey: "preview.labels.features", value: features.length === 0 ? phrase("revision.features.none") : { kind: "lines", lines: features } },
    { labelKey: "preview.labels.liveOn", value: dayValue(preview.liveOn, "preview.notLive") },
    { labelKey: "preview.labels.lastConfirmed", value: dayValue(preview.lastConfirmedOn, "preview.noConfirmation") },
  ];
}
