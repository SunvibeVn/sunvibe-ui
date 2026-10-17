"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, ShieldCheckIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { type MeResponse, accountStatusLabel, readMe } from "../lib/account-flow";
import { englishSessionTexts } from "../lib/english-session-texts";
import { accountDeps } from "../lib/signed-in-browser";
import { useSignedInLoad } from "../lib/use-signed-in-load";
import { useSession } from "../session/use-session";
import { FormSkeleton } from "./form-skeleton";
import { LoadError } from "./load-error";
import { LogoutButton } from "./logout-button";
import { RequireSession } from "./require-session";

// The profile is fetched and rendered only in the browser, with the tab's token (auth-browser-session §4.7): the
// server HTML holds no private data.

/** The signed-in user's account page. */
export function AccountOverview() {
  return (
    <RequireSession texts={englishSessionTexts}>
      <AccountForUser />
    </RequireSession>
  );
}

/** Loads the profile again for another signed-in user. */
function AccountForUser() {
  const { user } = useSession();
  return <AccountContent key={user?.userId ?? ""} />;
}

const loadProfile = () => readMe(accountDeps());

function AccountContent() {
  const { view, retry } = useSignedInLoad(loadProfile);
  if (view.kind === "loading") return <FormSkeleton fields={2} />;
  if (view.kind === "error") return <LoadError onRetry={retry} />;
  // RequireSession shows the session's state (signed out, unavailable) from the store.
  if (view.kind === "none") return null;
  return <Profile me={view.me} />;
}

function PhoneVerifiedNotice() {
  const params = useSearchParams();
  if (params.get("phone") !== "verified") return null;
  return <Alert tone="success">Your phone number is verified. Welcome to Sunvibe!</Alert>;
}

function Profile({ me }: { me: MeResponse }) {
  const fullName = me.fullName ?? "";
  const phoneVerified = me.phoneVerified ?? false;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <PhoneVerifiedNotice />
      </Suspense>
      {!phoneVerified && (
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
              {fullName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-navy-950">{fullName}</h1>
              <p className="text-sm text-slate-500">{accountStatusLabel(me.accountStatus)}</p>
            </div>
          </div>
          <LogoutButton />
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <Detail label="Phone number" value={me.username ?? ""} verified={phoneVerified} />
          <Detail
            label="Email"
            value={me.email ?? "Not provided"}
            verified={me.email ? (me.emailVerified ?? false) : undefined}
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
