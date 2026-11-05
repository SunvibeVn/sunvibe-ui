import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AUTH_ROUTES,
  AuthHeader,
  AuthNotice,
  FormSkeleton,
  parsePhoneMode,
  phoneRouteAccess,
  safeRedirectPath,
} from "@/features/auth";
import { PhoneLoginForm } from "@/features/auth/phone";

// Written out literally so Next inlines the value at build time.
const mode = parsePhoneMode(process.env.NEXT_PUBLIC_AUTH_PHONE_MODE);
const closed = phoneRouteAccess("login", mode) !== "show";

export async function generateMetadata(): Promise<Metadata> {
  // A closed page reveals nothing, not even its title.
  if (closed) notFound();
  return { title: "Log in with your phone", robots: { index: false, follow: false } };
}

export default function PhoneLoginPage({ searchParams }: PageProps<"/login/phone">) {
  if (closed) notFound();
  return (
    <>
      <AuthHeader title="Log in with your phone" centered />
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <PhoneLoginSection searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in with your email
        </Link>
      </p>
    </>
  );
}

async function PhoneLoginSection({ searchParams }: Pick<PageProps<"/login/phone">, "searchParams">) {
  const { next } = await searchParams;
  const safeNext = safeRedirectPath(next, "");
  return (
    <div className="space-y-5">
      <AuthNotice searchParams={searchParams} />
      <PhoneLoginForm mode={mode} next={safeNext || undefined} />
    </div>
  );
}
