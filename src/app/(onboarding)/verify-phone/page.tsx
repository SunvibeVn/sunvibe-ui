import type { Metadata } from "next";
import { AuthHeader, NoscriptNotice, VerifyPhoneSection } from "@/features/auth";

export const metadata: Metadata = { title: "Verify your phone" };

/** The account's phone is loaded in the browser only; the page itself never reads the session. */
export default function VerifyPhonePage() {
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
