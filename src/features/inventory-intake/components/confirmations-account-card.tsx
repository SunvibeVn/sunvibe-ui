import Link from "next/link";

import { CONFIRMATIONS_PATH } from "../lib/intake-routes";

/** The card of the `/account` overview. English literals like the other `/account` blocks (FC-6). */
export function ConfirmationsAccountCard() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-base font-semibold text-navy-950">Property confirmations</h2>
      <p className="mt-1 text-sm text-slate-500">Confirm that a property is yours when Sunvibe staff ask you to.</p>
      <Link href={CONFIRMATIONS_PATH} prefetch={false} className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:text-violet-800">
        Open your requests
      </Link>
    </section>
  );
}
