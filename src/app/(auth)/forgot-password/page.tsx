import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_ROUTES, AuthHeader, ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Forgot your password?"
        description="Choose how to receive a 6-digit code, then set a new password."
      />
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-sm text-slate-600">
        Remembered it?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
