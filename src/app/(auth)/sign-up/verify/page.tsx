import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, SignUpVerifySection } from "@/features/auth";

export const metadata: Metadata = { title: "Enter your code" };

export default function SignUpVerifyPage() {
  return (
    <>
      <AuthHeader title="Enter your code" centered />
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <SignUpVerifySection />
      </Suspense>
    </>
  );
}
