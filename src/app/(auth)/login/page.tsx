import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AUTH_ROUTES, AuthHeader, AuthNotice, FormSkeleton, LoginForm, safeRedirectPath } from "@/features/auth";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <AuthHeader title="Log in" centered />
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <LoginSection searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-slate-600">
        New to Sunvibe?{" "}
        <Link href={AUTH_ROUTES.signUp} className="font-semibold text-violet-700 hover:text-violet-800">
          Create an account
        </Link>
      </p>
    </>
  );
}

async function LoginSection({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  const safeNext = safeRedirectPath(next, "");
  return (
    <div className="space-y-5">
      <AuthNotice searchParams={searchParams} />
      <LoginForm next={safeNext || undefined} />
    </div>
  );
}
