import type { ReactNode } from "react";

/** A titled card of the detail page. */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

/** The `<dl>` holding the `DetailRow`s of a section. */
export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="mt-2 divide-y divide-slate-100">{children}</dl>;
}

/** One label and value pair; sits in a `DetailFields`. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-900 sm:col-span-2">{children}</dd>
    </div>
  );
}
