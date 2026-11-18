import { useTranslations } from "next-intl";
import { useId } from "react";

import type { AdvertisingModel } from "../lib/advertising-model";
import { phraseText } from "../lib/version-terms-model";

/**
 * "Advertising" on the staff page (brokerage-agreement US-4 AC-1, S6-D7, S6-D8): whether Sunvibe may advertise the unit
 * now, until the end of which date and with which public photos; or, when not, one line per group that stops it. It is a
 * part of the detail: it loads, fails and reloads with it, and the page alone decides whether to show it.
 */
export function AdvertisingPanel({ model }: { model: AdvertisingModel }) {
  const t = useTranslations("BrokerageAgreement");
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={titleId} className="text-base font-semibold text-slate-900">
        {t("advertising.title")}
      </h2>
      {model.allowed ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-emerald-800">{phraseText(t, model.line)}</p>
          <p className="text-slate-700">{phraseText(t, model.photos)}</p>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-slate-900">{t("advertising.notAllowed")}</p>
          {model.lines.map((line, index) => (
            <p key={`${index}:${line.key}`} className="break-words text-slate-700">
              {phraseText(t, line)}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
