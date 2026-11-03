"use client";

import { useTranslations } from "next-intl";

import type { PreviewRow, PreviewSection } from "../../lib/checklist/preview-model";

import type { PhotoGridMode } from "./photo-grid";
import { PhotosBody } from "./photos-panel";

function Rows({ rows }: { rows: readonly PreviewRow[] }) {
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-1 py-2 sm:grid-cols-3 sm:gap-4">
          <dt className="text-sm text-slate-500">{row.label}</dt>
          <dd className="min-w-0 space-y-0.5 sm:col-span-2">
            <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{row.text}</p>
            {row.provenance.map((line) => (
              <p key={line} className="break-words text-xs text-slate-500">
                {line}
              </p>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every group of a checklist read-only, each value or state with its provenance (survey-checklist spec 6.2): the
 * read-only Edit, the preview and a takeover's snapshot view. G7 shows the photos of the checklist on screen
 * (`evidence`; survey-media spec 6.2) or, in a snapshot and while photos are not available, the placeholder.
 */
export function ChecklistSections({
  sections,
  idPrefix,
  evidence,
}: {
  sections: readonly PreviewSection[];
  idPrefix: string;
  /** How G7 shows the current photos; left out for a takeover's snapshot (photos are not part of it). */
  evidence?: Exclude<PhotoGridMode, "edit">;
}) {
  const t = useTranslations("OwnerLeads");
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section
          key={section.group}
          id={`${idPrefix}-${section.group}`}
          aria-labelledby={`${idPrefix}-${section.group}-title`}
          className="scroll-mt-36 md:scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <h2 id={`${idPrefix}-${section.group}-title`} className="text-base font-semibold text-slate-900">
            {t(`checklist.groups.${section.group.toUpperCase() as "TERMS"}`)}
          </h2>
          {section.group === "evidence" ? (
            evidence === undefined ? (
              <p className="mt-2 text-sm text-slate-600">{t("checklist.evidence.text")}</p>
            ) : (
              <div id={idPrefix === "ro" ? "cl-evidence" : undefined} className="mt-2">
                <PhotosBody mode={evidence} />
              </div>
            )
          ) : (
            <div className="mt-2 space-y-3">
              {section.asset.length > 0 && <Rows rows={section.asset} />}
              {section.spaces.map((space) => (
                <div key={space.spaceId} className="rounded-lg bg-slate-50 px-3 py-2">
                  <h3 className="text-sm font-semibold text-slate-800">{t("checklist.preview.space", { code: space.code })}</h3>
                  <Rows rows={space.rows} />
                </div>
              ))}
              {section.group === "terms" && <p className="text-xs text-amber-700">{t("checklist.terms.notAgreed")}</p>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
