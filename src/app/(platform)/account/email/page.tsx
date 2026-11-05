import type { Metadata } from "next";
import { AccountEmailSection, NoscriptNotice } from "@/features/auth";

export const metadata: Metadata = { title: "Your email" };

/** The account is loaded in the browser only; the page itself never reads the session. */
export default function AccountEmailPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <NoscriptNotice />
      <AccountEmailSection />
    </div>
  );
}
