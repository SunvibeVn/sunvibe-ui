import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AUTH_ROUTES, AuthHeader, AuthNotice, parsePhoneMode, phoneRouteAccess } from "@/features/auth";
import { SignUpPhoneForm } from "@/features/auth/phone";

// Written out literally so Next inlines the value at build time.
const mode = parsePhoneMode(process.env.NEXT_PUBLIC_AUTH_PHONE_MODE);
const closed = phoneRouteAccess("sign-up", mode) !== "show";

export async function generateMetadata(): Promise<Metadata> {
  // A closed page reveals nothing, not even its title.
  if (closed) notFound();
  return { title: "Sign up with your phone", robots: { index: false, follow: false } };
}

export default function PhoneSignUpPage({ searchParams }: PageProps<"/sign-up/phone">) {
  if (closed) notFound();
  return (
    <>
      <AuthHeader title="Sign up with your phone" centered />
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
