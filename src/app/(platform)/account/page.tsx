import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountOverview, FormSkeleton } from "@/features/auth";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <AccountOverview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
