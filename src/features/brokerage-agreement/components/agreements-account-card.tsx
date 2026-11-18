import Link from "next/link";

/** The owner's page of brokerage agreements (brokerage-agreement S5-D17). */
const OWNER_AGREEMENTS_PATH = "/account/brokerage-agreements";

/**
 * The card of the `/account` overview for the brokerage agreements Sunvibe sent the account (brokerage-agreement US-2,
 * S5-D17). English literals like the other `/account` blocks (FC-6). Every account sees it: who is an owner is the
 * server's decision, and the page answers an account with nothing as it answers anyone else (S5-D18).
 */
export function AgreementsAccountCard() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-base font-semibold text-navy-950">Brokerage agreements</h2>
      <p className="mt-1 text-sm text-slate-500">Read the brokerage agreements Sunvibe sent you, and confirm or decline them.</p>
      <Link href={OWNER_AGREEMENTS_PATH} prefetch={false} className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:text-violet-800">
        Open your agreements
      </Link>
    </section>
  );
}
