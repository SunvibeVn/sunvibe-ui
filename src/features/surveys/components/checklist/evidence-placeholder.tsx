"use client";

import { useTranslations } from "next-intl";

/** G7 Photos: no content in this slice (survey-checklist C-1); readiness lists it as waiting for survey photos. */
export function EvidencePlaceholder() {
  const t = useTranslations("OwnerLeads");
  return (
    <section
      id="cl-group-evidence"
      aria-labelledby="cl-group-evidence-title"
      className="scroll-mt-32 rounded-xl md:scroll-mt-20 border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <h2 id="cl-group-evidence-title" className="text-base font-semibold text-slate-900">
        {t("checklist.panel.groupTitle", { no: 7, name: t("checklist.groups.EVIDENCE") })}
      </h2>
      <p id="cl-evidence" className="mt-2 text-sm text-slate-600">
        {t("checklist.evidence.text")}
      </p>
    </section>
  );
}
