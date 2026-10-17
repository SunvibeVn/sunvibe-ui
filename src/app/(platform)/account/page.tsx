import type { Metadata } from "next";
import { AccountOverview, NoscriptNotice } from "@/features/auth";

export const metadata: Metadata = { title: "Your account" };

/** The profile is loaded in the browser only; the page itself never reads the session. */
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <NoscriptNotice />
      <AccountOverview />
    </div>
  );
}
