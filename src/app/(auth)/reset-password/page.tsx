import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, ResetPasswordSection } from "@/features/auth";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <>
      <AuthHeader
        title="Set a new password"
        description="Enter the code we sent you and choose a new password. You'll be signed out of every device."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ResetPasswordSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}
