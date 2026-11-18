import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { FeePolicyView } from "../lib/fee-policy-model";
import { type Phrase, phraseText } from "../lib/version-terms-model";

/**
 * The read-only fee policy of one version (brokerage-agreement BR-7, S4-D10, S4-D14, S4-D15): for a version the owner
 * has not answered yet first the line that it is proposed; then who pays and when the fee arises (fixed statements), how
 * the fee is set, when it is due, the renewal fee, the refund on an early end and the protection period. It holds no
 * action and no staff-only value, so the owner's account screen of E05-S5 reuses it. It repeats no text the page shows
 * (status, type, version number, dates), so those stay unique on the page.
 */
export function FeePolicyPanel({ view }: { view: FeePolicyView }) {
  const t = useTranslations("BrokerageAgreement");
  const text = (phrase: Phrase) => phraseText(t, phrase);
  const item = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words text-slate-900">{value}</dd>
    </div>
  );
  const list = (label: string, phrases: Phrase[]) => {
    if (phrases.length === 0) return null;
    if (phrases.length === 1) return item(label, text(phrases[0] as Phrase));
    return item(
      label,
      <ul className="space-y-0.5">
        {phrases.map((phrase, index) => (
          <li key={`${index}:${phrase.key}`}>{text(phrase)}</li>
        ))}
      </ul>,
    );
  };

  return (
    <div className="space-y-1 text-sm">
      <h4 className="font-semibold text-slate-900">{t("fee.title")}</h4>
      {view.proposed && <p className="font-medium text-amber-800">{t("fee.proposed")}</p>}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {item(t("fee.label.payer"), text(view.payer))}
        {item(t("fee.label.chargedWhen"), text(view.chargedWhen))}
        {list(t("fee.label.formula"), view.formula)}
        {view.dueDays !== null && item(t("fee.label.dueDays"), text(view.dueDays))}
        {list(t("fee.label.renewal"), view.renewal)}
        {view.earlyLeaseEnd !== null && item(t("fee.label.earlyLeaseEnd"), text(view.earlyLeaseEnd))}
        {view.protectionDays !== null && item(t("fee.label.protectionDays"), text(view.protectionDays))}
      </dl>
    </div>
  );
}
