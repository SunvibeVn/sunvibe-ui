"use client";

import { useTranslations } from "next-intl";

import { formatDate, formatDateTime, formatPrice } from "../lib/format";
import { intentLabelKey, propertyTypeLabelKey, sourceLabelKey } from "../lib/labels";
import { mapDirectionsUrl } from "../lib/map-link";
import type { LeadDetail } from "../types";

import { DetailCell, DetailGrid, DetailSection } from "./detail-layout";

/** The map link in the primary button style of Save (owner 2026-10-23, D-8); 44px high on a phone (touch target). */
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brand-gradient px-4 py-1.5 sm:min-h-8 text-sm font-semibold text-white shadow-lg shadow-orange-700/25 transition-all hover:shadow-xl hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** True for a finite number: a lead without a position has no coordinates at all (null or missing). */
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The property side of the owner request, with consent, in columns that follow the card width (D-3, D-10); when
 * there are coordinates, the map button on its own row below.
 */
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
  const availableFrom = lead.availableFrom == null ? "" : formatDate(lead.availableFrom);
  const acceptedAt = consent?.acceptedAt === undefined ? "" : formatDateTime(consent.acceptedAt);
  const version = consent?.noticeVersion?.trim() ?? "";

  return (
    <DetailSection title={t("detail.asset.title")}>
      <DetailGrid>
        <DetailCell label={t("detail.asset.address")}>{lead.addressDetail?.trim() || none}</DetailCell>
        <DetailCell label={t("detail.asset.ward")}>{lead.wardName?.trim() || none}</DetailCell>
        <DetailCell label={t("detail.asset.intent")}>
          {intentKey === null ? none : t(intentKey)}
        </DetailCell>
        <DetailCell label={t("detail.asset.propertyType")}>
          {propertyTypeKey === null ? none : t(propertyTypeKey)}
        </DetailCell>
        <DetailCell label={t("detail.asset.askingPrice")}>{price || none}</DetailCell>
        <DetailCell label={t("detail.asset.availableFrom")}>{availableFrom || none}</DetailCell>
        <DetailCell label={t("detail.asset.notes")} wide>
          {lead.notes?.trim() ? <span className="whitespace-pre-wrap">{lead.notes}</span> : none}
        </DetailCell>
        <DetailCell label={t("detail.asset.source")}>
          {lead.source === undefined ? none : t(sourceLabelKey(lead.source))}
        </DetailCell>
        <DetailCell label={t("detail.consent.title")} wide>
          {acceptedAt === "" ? none : t("detail.consent.summary", { acceptedAt, version })}
        </DetailCell>
      </DetailGrid>
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
