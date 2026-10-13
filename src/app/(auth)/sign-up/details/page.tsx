import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, SignUpDetailsSection } from "@/features/auth";

export const metadata: Metadata = { title: "Complete your account" };

export default function SignUpDetailsPage() {
  return (
    <>
      <AuthHeader title="Complete your account" centered />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <SignUpDetailsSection />
      </Suspense>
    </>
  );
}
