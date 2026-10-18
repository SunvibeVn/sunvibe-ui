"use client";

import { useTranslations } from "next-intl";

import { formatDate, formatDateTime, formatPrice } from "../lib/format";
import { intentLabelKey, propertyTypeLabelKey, sourceLabelKey } from "../lib/labels";
import { mapDirectionsUrl } from "../lib/map-link";
import type { LeadDetail } from "../types";

import { DetailFields, DetailRow, DetailSection } from "./detail-layout";

const BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-violet-200 hover:bg-violet-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** True for a finite number: a lead without a position has no coordinates at all (null or missing). */
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The property side of the owner request, with consent and, when there are coordinates, the map button. */
export function LeadAsset({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("OwnerLeads");
  const none = <span className="text-slate-500">{t("detail.asset.none")}</span>;
  const { askingPrice, latitude, longitude, consent } = lead;
  const intentKey = intentLabelKey(lead.intent);
  const propertyTypeKey = propertyTypeLabelKey(lead.propertyType);
  const price =
    askingPrice?.amount != null && askingPrice.unit != null
      ? formatPrice({ amount: askingPrice.amount, unit: askingPrice.unit }, (key) => t(key))
      : "";
  const availableFrom = lead.availableFrom === undefined ? "" : formatDate(lead.availableFrom);
  const acceptedAt = consent?.acceptedAt === undefined ? "" : formatDateTime(consent.acceptedAt);
  const version = consent?.noticeVersion?.trim() ?? "";

  return (
    <DetailSection title={t("detail.asset.title")}>
      <DetailFields>
        <DetailRow label={t("detail.asset.address")}>{lead.addressDetail?.trim() || none}</DetailRow>
        <DetailRow label={t("detail.asset.ward")}>{lead.wardName?.trim() || none}</DetailRow>
        <DetailRow label={t("detail.asset.intent")}>
          {intentKey === null ? none : t(intentKey)}
        </DetailRow>
        <DetailRow label={t("detail.asset.propertyType")}>
          {propertyTypeKey === null ? none : t(propertyTypeKey)}
        </DetailRow>
        <DetailRow label={t("detail.asset.askingPrice")}>{price || none}</DetailRow>
        <DetailRow label={t("detail.asset.availableFrom")}>{availableFrom || none}</DetailRow>
        <DetailRow label={t("detail.asset.notes")}>
          {lead.notes?.trim() ? <span className="whitespace-pre-wrap">{lead.notes}</span> : none}
        </DetailRow>
        <DetailRow label={t("detail.asset.source")}>
          {lead.source === undefined ? none : t(sourceLabelKey(lead.source))}
        </DetailRow>
        <DetailRow label={t("detail.consent.title")}>
          {acceptedAt === "" ? none : t("detail.consent.summary", { acceptedAt, version })}
        </DetailRow>
      </DetailFields>
      {isCoordinate(latitude) && isCoordinate(longitude) && (
        <div className="mt-3">
          {/* Opens Google Maps only on this click (C-22); nothing is requested from Google before. */}
          <a
            href={mapDirectionsUrl(latitude, longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className={BUTTON}
          >
            {t("detail.map")}
          </a>
        </div>
      )}
    </DetailSection>
  );
}
