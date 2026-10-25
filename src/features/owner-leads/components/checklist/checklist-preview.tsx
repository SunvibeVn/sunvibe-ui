"use client";

import { useTranslations } from "next-intl";

import { previewModel } from "../../lib/checklist/preview-model";

import { useChecklistPage } from "./checklist-context";
import { ChecklistSections } from "./checklist-sections";
import { ReadinessList } from "./readiness-list";

/**
 * The Preview tab (survey-checklist spec 6.2, W16-31): every group and space with its provenance, the effective G8
 * values per space, the known gaps linking to their field in Edit, the unconfirmed terms, the warnings and the
 * submission line. There is no submit control (C-1).
 */
export function ChecklistPreview() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  const model = previewModel(view, t);
  return (
    <div className="space-y-4">
      <section aria-labelledby="readiness-title" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 id="readiness-title" className="sr-only">
          {t("checklist.preview.gaps")}
        </h2>
        <ReadinessList title={t("checklist.preview.gaps")} lines={model.gaps} empty={t("checklist.preview.noGaps")} />
        <ReadinessList
          title={t("checklist.preview.unconfirmed")}
          lines={model.unconfirmed}
          empty={t("checklist.preview.noUnconfirmed")}
        />
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">{t("checklist.preview.warnings")}</h3>
          {model.warnings.length === 0 ? (
            <p className="text-sm text-slate-600">{t("checklist.preview.noWarnings")}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {model.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-sm text-slate-700">{t("checklist.preview.submission")}</p>
      </section>

      <ChecklistSections sections={model.sections} idPrefix="pv" />

      {model.effective.length > 0 && (
        <section aria-labelledby="effective-title" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 id="effective-title" className="text-base font-semibold text-slate-900">
            {t("checklist.preview.effective")}
          </h2>
          <p className="mt-1 text-xs text-amber-700">{t("checklist.terms.notAgreed")}</p>
          <div className="mt-3 space-y-3">
            {model.effective.map((space) => (
              <div key={space.spaceCode} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <h3 className="font-semibold text-slate-800">{t("checklist.preview.space", { code: space.spaceCode })}</h3>
                <dl className="mt-1 space-y-1">
                  {space.charges.map((charge) => (
                    <div key={charge.label} className="grid gap-1 sm:grid-cols-3 sm:gap-4">
                      <dt className="text-slate-500">{charge.label}</dt>
                      <dd className="break-words text-slate-900 sm:col-span-2">
                        {charge.text} <span className="text-xs text-slate-500">({charge.origin})</span>
                      </dd>
                    </div>
                  ))}
                  <div className="grid gap-1 sm:grid-cols-3 sm:gap-4">
                    <dt className="text-slate-500">{t("checklist.preview.commonFees")}</dt>
                    <dd className="break-words text-slate-900 sm:col-span-2">{space.commonFees}</dd>
                  </div>
                  {space.spaceFees !== null && (
                    <div className="grid gap-1 sm:grid-cols-3 sm:gap-4">
                      <dt className="text-slate-500">{t("checklist.preview.spaceFees")}</dt>
                      <dd className="break-words text-slate-900 sm:col-span-2">{space.spaceFees}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
