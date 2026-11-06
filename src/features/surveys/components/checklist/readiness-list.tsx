"use client";

import Link from "next/link";

import type { PreviewLine } from "../../lib/checklist/preview-model";
import { checklistHref } from "../../lib/checklist/routes";

import { useChecklistPage } from "./checklist-context";

/** A readiness list of the preview (spec 6.2): each item links to its field in the Edit tab. */
export function ReadinessList({ title, lines, empty }: { title: string; lines: readonly PreviewLine[]; empty: string }) {
  const { leadId, checklistId } = useChecklistPage();
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {lines.map((line, index) => (
            <li key={`${line.anchor}-${index}`}>
              <Link
                href={`${checklistHref(leadId, checklistId)}#${line.anchor}`}
                prefetch={false}
                className="break-words text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {line.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
