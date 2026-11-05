import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_ROUTES, AuthHeader, NoscriptNotice, parsePhoneMode, phoneRouteAccess, VerifyPhoneSection } from "@/features/auth";

// Written out literally so Next inlines the value at build time.
const mode = parsePhoneMode(process.env.NEXT_PUBLIC_AUTH_PHONE_MODE);

export const metadata: Metadata = { title: "Verify your phone" };

/** The account's phone is loaded in the browser only; the page itself never reads the session. */
export default function VerifyPhonePage() {
  // While phone verification is closed nothing here could work: the account page says what to do next.
  if (phoneRouteAccess("verify-phone", mode) !== "show") redirect(AUTH_ROUTES.account);
  return (
    <>
      <AuthHeader
        title="Verify your phone number"
        description="We'll text you a 6-digit code. Your account stays pending until you confirm it."
      />
      <NoscriptNotice />
      <VerifyPhoneSection />
    </>
  );
}
