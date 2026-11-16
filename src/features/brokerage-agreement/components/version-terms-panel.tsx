import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { type Phrase, phraseText, type VersionContent } from "../lib/version-terms-model";

/**
 * The read-only content of one version (brokerage-agreement BR-8, BR-9, S3-D6, S3-D13, S3-D14): for a DRAFT version
 * first the line that these are proposed terms; then the advertising permission, the public photo consent and the
 * rental terms. It holds no action and no staff-only value, so the owner's account screen of E05-S5 reuses it. It
 * repeats no text the page shows (status, type, version number, dates), so those stay unique on the page.
 */
export function VersionTermsPanel({ content }: { content: VersionContent }) {
  const t = useTranslations("BrokerageAgreement");
  const text = (phrase: Phrase) => phraseText(t, phrase);
  const item = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words text-slate-900">{value}</dd>
    </div>
  );

  const { fees } = content;
  let feesValue: ReactNode;
  if (fees.kind === "notStated") feesValue = t("terms.feesNotStated");
  else if (fees.kind === "none") feesValue = t("terms.noFees");
  else
    feesValue = (
      <ul className="space-y-0.5">
        {fees.lines.map((line, index) => (
          <li key={`${index}:${line.key}`}>{text(line)}</li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-3 text-sm">
      {content.proposed && <p className="font-medium text-amber-800">{t("terms.proposed")}</p>}
      {content.advertising !== null && <dl>{item(t("terms.advertising"), text(content.advertising))}</dl>}
      <div className="space-y-1">
        <h4 className="font-semibold text-slate-900">{t("terms.photos")}</h4>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {item(t("terms.interior"), text(content.interior))}
          {item(t("terms.exterior"), text(content.exterior))}
        </dl>
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold text-slate-900">{t("terms.rental")}</h4>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {content.monthlyRent !== null && item(t("terms.monthlyRent"), text(content.monthlyRent))}
          {content.deposit !== null && item(t("terms.deposit"), text(content.deposit))}
          {content.minimumTerm !== null && item(t("terms.minimumTerm"), text(content.minimumTerm))}
          {content.paymentPeriod !== null && item(t("terms.paymentPeriod"), text(content.paymentPeriod))}
          {item(t("terms.mandatoryFees"), feesValue)}
        </dl>
      </div>
    </div>
  );
}
