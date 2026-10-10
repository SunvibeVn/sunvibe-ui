import Link from "next/link";
import { CheckIcon, ShieldCheckIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { requireUser } from "../session/dal";
import { LogoutButton } from "./logout-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const statusLabels: Record<string, string> = {
  PENDING: "Pending phone verification",
  ACTIVE: "Active",
};

/** Reads the session and search params, so render it inside <Suspense>. */
export async function AccountOverview({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([requireUser(AUTH_ROUTES.account), searchParams]);
  const status = statusLabels[user.accountStatus] ?? user.accountStatus.toLowerCase();

  return (
    <div className="space-y-6">
      {params.phone === "verified" && (
        <Alert tone="success">Your phone number is verified. Welcome to Sunvibe!</Alert>
      )}
      {!user.phoneVerified && (
        <Alert tone="info" title="Verify your phone number">
          Your account stays pending until you confirm your phone.{" "}
          <Link href={AUTH_ROUTES.verifyPhone} className="font-semibold underline underline-offset-2">
            Verify now
          </Link>
        </Alert>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xl font-semibold text-white">
              {user.fullName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-navy-950">{user.fullName}</h1>
              <p className="text-sm text-slate-500">{status}</p>
            </div>
          </div>
          <LogoutButton />
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <Detail label="Phone number" value={user.phoneNumber} verified={user.phoneVerified} />
          <Detail
            label="Email"
            value={user.email ?? "Not provided"}
            verified={user.email ? user.emailVerified : undefined}
          />
        </dl>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheckIcon size={14} />
        Your session is protected and renews automatically while you use Sunvibe.
      </p>
    </div>
  );
}

function Detail({ label, value, verified }: { label: string; value: string; verified?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
        {value}
        {verified !== undefined && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {verified && <CheckIcon size={12} strokeWidth={3} />}
            {verified ? "Verified" : "Not verified"}
          </span>
        )}
      </dd>
    </div>
  );
}
