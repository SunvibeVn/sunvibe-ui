import type { ReactNode } from "react";

/** A titled card of the detail page. Fills the height of its grid row (D-6). */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="@container h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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

/**
 * A `<dl>` of `DetailCell`s, label above value (Property, D-3). The columns follow the width of the card, not of the
 * screen: two from 18rem (a phone), four from 36rem, so a price never breaks inside a word.
 */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="mt-3 grid gap-x-4 gap-y-3 @2xs:grid-cols-2 @xl:grid-cols-4">{children}</dl>;
}

/** One label and value pair in a `DetailGrid`; `wide` takes two columns, for free text. */
export function DetailCell({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "@2xs:col-span-2" : ""}`}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}
