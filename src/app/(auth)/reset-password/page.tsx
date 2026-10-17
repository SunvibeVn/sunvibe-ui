import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, ResetPasswordSection } from "@/features/auth";

export const metadata: Metadata = { title: "Set a new password" };

type SearchParams = PageProps<"/reset-password">["searchParams"];

/** Only whether the address carries a reset link reaches the page: the token itself is never read on the server. */
async function ResetPasswordContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const via = params.via === "sms" ? "sms" : "email";
  const fromLink = (typeof params.token === "string" && params.token !== "") || via === "sms";
  return <ResetPasswordSection via={via} fromLink={fromLink} />;
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
