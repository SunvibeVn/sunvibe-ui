import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AUTH_ROUTES, AuthHeader, AuthNotice, parsePhoneMode, SignUpEmailForm } from "@/features/auth";

export const metadata: Metadata = { title: "Create an account" };

// Written out literally so Next inlines the value at build time.
const mode = parsePhoneMode(process.env.NEXT_PUBLIC_AUTH_PHONE_MODE);

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <>
      <AuthHeader title="Sign Up" centered />
      <div className="space-y-5">
        <Suspense fallback={null}>
          <AuthNotice searchParams={searchParams} />
        </Suspense>
        <SignUpEmailForm />
      </div>
      {mode === "on" && (
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href={AUTH_ROUTES.signUpPhone} className="font-semibold text-violet-700 hover:text-violet-800">
            Sign up with your phone number
          </Link>
        </p>
      )}
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
