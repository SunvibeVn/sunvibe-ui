"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/features/auth/client";
import { WORKSPACE_HOME, isStaff } from "../lib/nav";

// Same box for the placeholder and the link, so the header does not shift when the session is restored.
const boxClass = "inline-flex w-24 items-center justify-end whitespace-nowrap text-sm font-medium";
const linkClass =
  "text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

/**
 * "Khu làm việc" in the site header (C-23, C-31): the link only for a signed-in user with a staff workspace role.
 * On public pages the session stays `restoring`, so everyone else sees an empty box of the same width. UX only: the
 * workspace checks the session and roles again, and the API decides every call.
 */
export function WorkspaceLink() {
  const t = useTranslations("Workspace");
  const { status, user } = useSession();
  if (status !== "signed-in" || !user || !isStaff(user.roles)) {
    return <span aria-hidden className={boxClass} />;
  }
  return (
    <Link
      href={WORKSPACE_HOME}
      prefetch={false}
      className={`${boxClass} ${linkClass}`}
    >
      {t("link")}
    </Link>
  );
}
