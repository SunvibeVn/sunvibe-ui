"use client";

import Link from "next/link";
import { useSession } from "@/features/auth/client";
import { WORKSPACE_HOME, isStaff } from "../lib/nav";

/**
 * The workspace card of the `/account` overview, for staff workspace roles only (C-23, C-31). English literals like the
 * other `/account` blocks (FC-6): `/account` is an English auth screen outside the workspace messages.
 */
export function WorkspaceAccountCard() {
  const { status, user } = useSession();
  if (status !== "signed-in" || !user || !isStaff(user.roles)) return null;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-base font-semibold text-navy-950">Workspace</h2>
      <p className="mt-1 text-sm text-slate-500">View and work owner leads.</p>
      <Link
        href={WORKSPACE_HOME}
        prefetch={false}
        className="mt-4 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-700/25 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        Open workspace
      </Link>
    </section>
  );
}
