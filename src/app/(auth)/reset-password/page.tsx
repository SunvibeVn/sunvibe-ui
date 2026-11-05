import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, ResetPasswordSection } from "@/features/auth";

export const metadata: Metadata = { title: "Set a new password" };

type SearchParams = PageProps<"/reset-password">["searchParams"];

/** The token of an e-mail link is in the fragment, so it never reaches this page. Only the SMS step shows here. */
async function ResetPasswordContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const via = params.via === "sms" ? "sms" : "email";
  return <ResetPasswordSection via={via} fromLink={via === "sms"} />;
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <>
      <AuthHeader
        title="Set a new password"
        description="Enter the code we sent you and choose a new password. You'll be signed out of every device."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ResetPasswordContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
