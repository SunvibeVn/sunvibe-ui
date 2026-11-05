import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AUTH_ROUTES,
  AuthHeader,
  AuthNotice,
  FormSkeleton,
  LoginForm,
  parsePhoneMode,
  safeRedirectPath,
} from "@/features/auth";

export const metadata: Metadata = { title: "Log in" };

// Written out literally so Next inlines the value at build time.
const mode = parsePhoneMode(process.env.NEXT_PUBLIC_AUTH_PHONE_MODE);

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <AuthHeader title="Log in" centered />
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <LoginSection searchParams={searchParams} />
      </Suspense>
      {/* `legacy-login` has no link: only the people told of it use /login/phone (auth-email-access D4-1). */}
      {mode === "on" && (
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href={AUTH_ROUTES.loginPhone} className="font-semibold text-violet-700 hover:text-violet-800">
            Log in with your phone number
          </Link>
        </p>
      )}
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
