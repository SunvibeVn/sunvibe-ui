"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";

import { type Phrase, phraseText } from "../lib/revision-text";

/**
 * The problems of a revision, one sentence each (listing-publish US-2 AC-3, AC-4, spec section 6, RD-15): what still
 * stops a submission under the Draft form, or the entries of a refused submission in the panel's alert, whose list
 * takes the focus when it appears. The sentences never quote the text that matched. No problem: nothing.
 */
export function RevisionProblemsNotice({
  heading,
  problems,
  focusOnMount = false,
}: {
  heading: string;
  problems: Phrase[];
  focusOnMount?: boolean;
}) {
  const t = useTranslations("ListingPublish");
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (focusOnMount) listRef.current?.focus();
  }, [focusOnMount]);

  if (problems.length === 0) return null;
  return (
    <div className="space-y-1 text-sm">
      <p id={headingId} className="font-medium text-slate-900">
        {heading}
      </p>
      <ul
        ref={listRef}
        aria-labelledby={headingId}
        tabIndex={-1}
        className="list-disc space-y-0.5 pl-5 text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        {problems.map((problem, index) => (
          <li key={`${index}:${problem.key}`} className="break-words">
            {phraseText(t, problem)}
          </li>
        ))}
      </ul>
    </div>
  );
}
