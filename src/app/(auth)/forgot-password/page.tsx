import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_ROUTES, AuthHeader, ForgotPasswordForm, parsePhoneMode } from "@/features/auth";

export const metadata: Metadata = { title: "Forgot password" };

// Written out literally so Next inlines the value at build time.
const smsEnabled = parsePhoneMode(process.env.NEXT_PUBLIC_AUTH_PHONE_MODE) === "on";

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Forgot your password?"
        description={
          smsEnabled
            ? "Choose how to receive a 6-digit code, then set a new password."
            : "We'll email you a 6-digit code and a link to set a new password."
        }
      />
      <ForgotPasswordForm smsEnabled={smsEnabled} />
      <p className="mt-8 text-center text-sm text-slate-600">
        Remembered it?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
