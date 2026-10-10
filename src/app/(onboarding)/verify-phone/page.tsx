import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, VerifyPhoneSection } from "@/features/auth";

export const metadata: Metadata = { title: "Verify your phone" };

export default function VerifyPhonePage() {
  return (
    <>
      <AuthHeader
        title="Verify your phone number"
        description="We'll text you a 6-digit code. Your account stays pending until you confirm it."
      />
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <VerifyPhoneSection />
      </Suspense>
    </>
  );
}
