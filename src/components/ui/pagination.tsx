import Link from "next/link";

type PaginationProps = {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  /** Accessible name of the navigation landmark. */
  label: string;
  /** Visible text between the links, e.g. "Trang 2 / 5". */
  summary: string;
  previousLabel: string;
  nextLabel: string;
};

const linkClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";
const disabledClass =
  "inline-flex cursor-not-allowed items-center rounded-full border border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400";

export function Pagination({ page, totalPages, hrefFor, label, summary, previousLabel, nextLabel }: PaginationProps) {
  if (totalPages <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      {hasPrev ? (
        <Link href={hrefFor(page - 1)} prefetch={false} rel="prev" className={linkClass}>
          {previousLabel}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          {previousLabel}
        </span>
      )}
      <span className="text-sm text-slate-600" aria-live="polite">
        {summary}
      </span>
      {hasNext ? (
        <Link href={hrefFor(page + 1)} prefetch={false} rel="next" className={linkClass}>
          {nextLabel}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          {nextLabel}
        </span>
      )}
    </nav>
  );
}
