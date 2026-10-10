import Link from "next/link";
import { Suspense } from "react";
import { UserIcon } from "@/components/icons";
import { AUTH_ROUTES } from "../constants";
import { hasSession } from "../session/dal";

const linkClass = "inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-violet-700";

/** "Log in" or "Account" in the site header. Reads cookies only, so it never calls the backend. */
export function UserMenu() {
  return (
    <Suspense fallback={<span aria-hidden className="inline-block h-4 w-14 animate-pulse rounded bg-slate-100" />}>
      <UserMenuLink />
    </Suspense>
  );
}

async function UserMenuLink() {
  return (await hasSession()) ? (
    <Link href={AUTH_ROUTES.account} className={linkClass}>
      <UserIcon size={16} />
      Account
    </Link>
  ) : (
    <Link href={AUTH_ROUTES.login} className={linkClass}>
      Log in
    </Link>
  );
}
