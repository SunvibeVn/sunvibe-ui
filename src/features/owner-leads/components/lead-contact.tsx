"use client";

import { useTranslations } from "next-intl";

import type { LeadDetail } from "../types";

import { CopyValue } from "./copy-value";
import { DetailFields, DetailRow, DetailSection } from "./detail-layout";

/**
 * Contact data of the owner (US-4 AC-1, AC-2): phone and e-mail as plain text, each with a copy button (owner
 * 2026-10-23, D-7: no `tel:` or `mailto:` link).
 */
export function LeadContact({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("OwnerLeads.detail");
  const none = <span className="text-slate-500">{t("contact.none")}</span>;
  const phone = lead.phone?.trim();
  const email = lead.email?.trim();
  const callback = lead.preferredCallbackTime?.trim();
  return (
    <DetailSection title={t("contact.title")}>
      <DetailFields>
        <DetailRow label={t("contact.name")}>{lead.contactName?.trim() || none}</DetailRow>
        <DetailRow label={t("contact.phone")}>
          {phone ? <CopyValue value={phone} label={t("contact.copyPhone")} /> : none}
        </DetailRow>
        <DetailRow label={t("contact.email")}>
          {email ? <CopyValue value={email} label={t("contact.copyEmail")} breakAll /> : none}
        </DetailRow>
        <DetailRow label={t("contact.callbackTime")}>{callback || none}</DetailRow>
      </DetailFields>
    </DetailSection>
  );
}
