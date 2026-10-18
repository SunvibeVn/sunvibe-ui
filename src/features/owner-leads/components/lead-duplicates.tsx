"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { formatDateTime } from "../lib/format";
import type { DuplicateCandidate } from "../types";

import { DetailSection } from "./detail-layout";
import { LeadStatusBadge } from "./lead-status-badge";
import { leadDetailHref } from "./list-href";

/** Possible duplicates the viewer may see: request code, status, created date, and a link to each (US-4 AC-4). */
export function LeadDuplicates({ candidates }: { candidates: readonly DuplicateCandidate[] }) {
  const t = useTranslations("OwnerLeads.detail.duplicates");
  return (
    <DetailSection title={t("title")}>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{t("empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {candidates.map((candidate, index) => {
            const code = candidate.requestCode ?? "";
            const created = candidate.createdAt === undefined ? "" : formatDateTime(candidate.createdAt);
            return (
              <li
                key={candidate.id ?? `${code}-${index}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                {candidate.id === undefined ? (
                  <span className="font-semibold">{code}</span>
                ) : (
                  <Link
                    href={leadDetailHref(candidate.id)}
                    prefetch={false}
                    aria-label={t("open", { code })}
                    className="inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                  >
                    {code}
                  </Link>
                )}
                <LeadStatusBadge status={candidate.status} />
                {created !== "" && <span className="text-slate-600">{created}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </DetailSection>
  );
}
