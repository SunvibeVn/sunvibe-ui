import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import type { AgreementListRow } from "../lib/agreement-list-model";
import { calendarDateText } from "../lib/date-text";
import { phraseText } from "../lib/version-terms-model";

/**
 * The rows of the agreement list (brokerage-agreement US-4 AC-1, AC-3, BR-12, spec section 6): the unit code as the link
 * to the agreement's page, its state and latest version at the read, whether Sunvibe may advertise the unit now (with
 * its end date, or one line per group that stops it) and its creation date in Vietnam time. Server text is rendered as
 * text only; no term, fee or owner value (BR-17).
 */
export function AgreementList({ rows }: { rows: AgreementListRow[] }) {
  const t = useTranslations("BrokerageAgreement");
  const format = useFormatter();

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.agreementId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Link
              href={row.href}
              prefetch={false}
              className="min-w-0 break-words font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              {row.unitCode ?? t("list.noCode")}
            </Link>
            <span className="text-sm font-semibold text-slate-900">{t(row.statusKey)}</span>
          </div>
          {row.version !== null && (
            <p className="text-sm text-slate-700">
              {t("list.version", { number: row.version.number, status: t(row.version.statusKey) })}
            </p>
          )}
          {row.advertising.allowed ? (
            <p className="text-sm font-medium text-emerald-800">
              {row.advertising.endDate !== null
                ? t("advertising.allowed", { date: calendarDateText(row.advertising.endDate) })
                : t("advertising.allowedNoEnd")}
            </p>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-900">{t("advertising.notAllowed")}</p>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
                {row.advertising.reasons.map((reason, index) => (
                  <li key={`${index}:${reason.key}`} className="break-words">
                    {phraseText(t, reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.createdAt !== null && (
            <p className="text-xs text-slate-500">
              {t("list.created", { date: format.dateTime(new Date(row.createdAt), { dateStyle: "medium" }) })}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
