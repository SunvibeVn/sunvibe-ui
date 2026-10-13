import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, SignUpVerifySection } from "@/features/auth";

export const metadata: Metadata = { title: "Verify your phone" };

export default function SignUpVerifyPage() {
  return (
    <>
      <AuthHeader title="Verify your phone" centered />
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <SignUpVerifySection />
      </Suspense>
    </>
  );
}
