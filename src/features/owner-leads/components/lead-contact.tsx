"use client";

import { useTranslations } from "next-intl";

import { mailtoHref, telHref } from "../lib/contact-links";
import type { LeadDetail } from "../types";

import { DetailFields, DetailRow, DetailSection } from "./detail-layout";

const LINK =
  "font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/**
 * Contact data of the owner: phone as `tel:`, e-mail as `mailto:` (US-4 AC-1, AC-2), each only when the value is safe
 * to link (SEC-M1); otherwise the value is plain text.
 */
export function LeadContact({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("OwnerLeads.detail");
  const none = <span className="text-slate-500">{t("contact.none")}</span>;
  const phone = lead.phone?.trim();
  const email = lead.email?.trim();
  const callback = lead.preferredCallbackTime?.trim();
  const phoneHref = phone ? telHref(phone) : null;
  const emailHref = email ? mailtoHref(email) : null;
  return (
    <DetailSection title={t("contact.title")}>
      <DetailFields>
        <DetailRow label={t("contact.name")}>{lead.contactName?.trim() || none}</DetailRow>
        <DetailRow label={t("contact.phone")}>
          {!phone ? (
            none
          ) : phoneHref === null ? (
            phone
          ) : (
            <a href={phoneHref} className={LINK}>
              {phone}
            </a>
          )}
        </DetailRow>
        <DetailRow label={t("contact.email")}>
          {!email ? (
            none
          ) : emailHref === null ? (
            <span className="break-all">{email}</span>
          ) : (
            <a href={emailHref} className={`${LINK} break-all`}>
              {email}
            </a>
          )}
        </DetailRow>
        <DetailRow label={t("contact.callbackTime")}>{callback || none}</DetailRow>
      </DetailFields>
    </DetailSection>
  );
}
