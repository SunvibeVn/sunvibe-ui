"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { CheckIcon, ShieldCheckIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { type MeResponse, accountOverview, accountStatusLabel, readMe } from "../lib/account-flow";
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

/**
 * The signed-in user's account page. `children` are extra cards the page composes below the profile (the app layer
 * adds the workspace card, so auth does not import other features).
 */
export function AccountOverview({ children }: { children?: ReactNode }) {
  return (
    <RequireSession texts={englishSessionTexts}>
      <AccountForUser>{children}</AccountForUser>
    </RequireSession>
  );
}

/** Loads the profile again for another signed-in user. */
function AccountForUser({ children }: { children?: ReactNode }) {
  const { user } = useSession();
  return <AccountContent key={user?.userId ?? ""}>{children}</AccountContent>;
}

const loadProfile = () => readMe(accountDeps());

function AccountContent({ children }: { children?: ReactNode }) {
  const { view, retry } = useSignedInLoad(loadProfile);
  if (view.kind === "loading") return <FormSkeleton fields={2} />;
  if (view.kind === "error") return <LoadError onRetry={retry} />;
  // RequireSession shows the session's state (signed out, unavailable) from the store.
  if (view.kind === "none") return null;
  return <Profile me={view.me}>{children}</Profile>;
}

/** One-off messages of the flows that end on this page. */
function DoneNotice() {
  const params = useSearchParams();
  if (params.get("phone") === "verified") {
    return <Alert tone="success">Your phone number is verified. Welcome to Sunvibe!</Alert>;
  }
  if (params.get("email") === "bound") {
    return <Alert tone="success">Your email is saved. Use it to log in from now on.</Alert>;
  }
  return null;
}

function Profile({ me, children }: { me: MeResponse; children?: ReactNode }) {
  const fullName = me.fullName ?? "";
  const { email, phone, prompt } = accountOverview(me);

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <DoneNotice />
      </Suspense>
      {prompt === "bind-email" && (
        <Alert tone="info" title="Add your email">
          You&apos;ll log in with your email and use it to recover your password.{" "}
          <Link href={AUTH_ROUTES.accountEmail} className="font-semibold underline underline-offset-2">
            Add email
          </Link>
        </Alert>
      )}
      {prompt === "verify-phone" && (
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
          <Detail
            label="Email"
            value={email.value}
            verified={email.verified}
            action={
              <Link href={AUTH_ROUTES.accountEmail} className="font-semibold text-violet-700 hover:text-violet-800">
                {email.action}
              </Link>
            }
          />
          {phone && <Detail label="Phone number" value={phone.value} verified={phone.verified} />}
        </dl>
      </section>

      {children}

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheckIcon size={14} />
        Your session is protected and renews automatically while you use Sunvibe.
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  verified,
  action,
}: {
  label: string;
  value: string;
  verified?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium break-all text-slate-900">
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
      {action && <dd className="mt-1 text-sm">{action}</dd>}
    </div>
  );
}
