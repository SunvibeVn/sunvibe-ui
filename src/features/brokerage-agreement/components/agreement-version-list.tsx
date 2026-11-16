import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import type { VersionRow } from "../lib/agreement-model";

import { VersionTermsPanel } from "./version-terms-panel";

type VersionListProps = {
  versions: VersionRow[];
  /** The edit form of the draft (brokerage-agreement E05-S3): shown for that version in place of its period and content. */
  draftEditor?: { versionNo: number; node: ReactNode };
};

/** The versions of an agreement, by number: each with its state, its period as calendar dates, and its content. */
export function AgreementVersionList({ versions, draftEditor }: VersionListProps) {
  const t = useTranslations("BrokerageAgreement");

  return (
    <ul className="divide-y divide-slate-100">
      {versions.map((version, index) => (
        <li key={`${index}:${version.versionNo}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{t("detail.version", { number: version.versionNo })}</h3>
            <Badge tone="neutral">{t(version.statusKey)}</Badge>
          </div>
          {draftEditor !== undefined && draftEditor.versionNo === version.versionNo ? (
            draftEditor.node
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">{t("detail.startDate")}</dt>
                  <dd className="text-slate-900">{version.startText}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("detail.endDate")}</dt>
                  <dd className="text-slate-900">{version.endText}</dd>
                </div>
              </dl>
              <VersionTermsPanel content={version.content} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
