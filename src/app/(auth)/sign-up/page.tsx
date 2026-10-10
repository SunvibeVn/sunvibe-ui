import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_ROUTES, AuthHeader, SignUpForm } from "@/features/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeader
        title="Create your account"
        description="Join Sunvibe to find, list and lease properties with AI doing the busywork."
      />
      <SignUpForm />
      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
