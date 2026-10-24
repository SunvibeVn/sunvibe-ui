"use client";

import { useTranslations } from "next-intl";

import { formatDate, formatDateTime } from "@/lib/format/vietnam-time";

import { formatPrice } from "../../lib/format";
import { intentLabelKey } from "../../lib/labels";
import type { LeadDetail } from "../../types";

type IntentChange = NonNullable<LeadDetail["intentChanges"]>[number];
type Price = IntentChange["fromAskingPrice"] | null;

/**
 * The lead's requirement changes, newest first (spec 6.1, A-18): old → new requirement and price, reason, the owner's
 * agreement and who recorded it when. The owner's own submission is never changed (US-5).
 */
export function RequirementChanges({ changes }: { changes: readonly (IntentChange | null)[] }) {
  const t = useTranslations("OwnerLeads");
  const list = changes.filter((change): change is IntentChange => change !== null).reverse();
  if (list.length === 0) return null;
  const intent = (value: string | null | undefined) => {
    const key = intentLabelKey(value);
    return key === null ? "—" : t(key);
  };
  const price = (value: Price) =>
    value?.amount != null && value.unit != null
      ? formatPrice({ amount: value.amount, unit: value.unit }, (key) => t(key))
      : t("survey.requirementChanges.noPrice");

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{t("survey.requirementChanges.title")}</h3>
      <ol className="space-y-2">
        {list.map((change, index) => (
          <li key={`${change.occurredAt ?? ""}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900">
              {t("survey.requirementChanges.change", { from: intent(change.fromIntent), to: intent(change.toIntent) })}
              {change.newIntentCycle != null && (
                <span className="ml-2 font-normal text-slate-500">
                  {t("survey.requirementChanges.cycle", { cycle: change.newIntentCycle })}
                </span>
              )}
            </p>
            <dl className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr]">
              <dt className="text-slate-500">{t("survey.requirementChanges.price")}</dt>
              <dd>
                {t("survey.requirementChanges.change", {
                  from: price(change.fromAskingPrice ?? null),
                  to: price(change.toAskingPrice ?? null),
                })}
              </dd>
              <dt className="text-slate-500">{t("survey.requirementChanges.reason")}</dt>
              <dd className="whitespace-pre-wrap break-words">{change.reason ?? ""}</dd>
              <dt className="text-slate-500">{t("survey.requirementChanges.basis")}</dt>
              <dd className="whitespace-pre-wrap break-words">
                {t("survey.basisValue", {
                  date: change.basis?.confirmedOn ? formatDate(change.basis.confirmedOn) : "",
                  text: change.basis?.text ?? "",
                })}
              </dd>
              <dt className="text-slate-500">{t("survey.requirementChanges.by")}</dt>
              <dd>
                {t("survey.personTime", {
                  name: change.actorName?.trim() || t("survey.unknownPerson"),
                  time: change.occurredAt ? formatDateTime(change.occurredAt) : "",
                })}
              </dd>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
