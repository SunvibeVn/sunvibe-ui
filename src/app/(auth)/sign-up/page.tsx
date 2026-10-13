import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AUTH_ROUTES, AuthHeader, AuthNotice, SignUpPhoneForm } from "@/features/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <>
      <AuthHeader title="Sign Up" centered />
      <div className="space-y-5">
        <Suspense fallback={null}>
          <AuthNotice searchParams={searchParams} />
        </Suspense>
        <SignUpPhoneForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
