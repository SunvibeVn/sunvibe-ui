import Link from "next/link";
import { Suspense } from "react";
import { UserIcon } from "@/components/icons";
import { AUTH_ROUTES } from "../constants";
import { hasSession } from "../session/dal";

const linkClass = "inline-flex items-center gap-1.5 text-sm font-medium text-white transition-colors hover:text-white/70";

/** "Log in" or "Account" in the site header. Reads cookies only, so it never calls the backend. */
export function UserMenu() {
  return (
    <Suspense fallback={<span aria-hidden className="inline-block h-5 w-5 animate-pulse rounded bg-white/10" />}>
      <UserMenuLink />
    </Suspense>
  );
}

async function UserMenuLink() {
  return (await hasSession()) ? (
    <Link href={AUTH_ROUTES.account} className={linkClass}>
      <UserIcon size={22} />
      <span className="sr-only">Account</span>
    </Link>
  ) : (
    <Link href={AUTH_ROUTES.login} className={linkClass} aria-label="Log in">
      <UserIcon size={22} />
    </Link>
  );
}
