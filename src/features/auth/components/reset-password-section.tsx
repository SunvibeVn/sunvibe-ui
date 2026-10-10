import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { readResetToken } from "../session/cookies";
import { ResetPasswordForm } from "./reset-password-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Reads search params and cookies, so render it inside <Suspense>. */
export async function ResetPasswordSection({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token ? params.token : undefined;
  const via = params.via === "sms" ? "sms" : "email";

  if (!token && !(await readResetToken())) {
    return (
      <div className="space-y-5">
        <Alert tone="error" title="This link is invalid or has expired">
          Reset links and codes only work for a short time and only once.
        </Alert>
        <Link href={AUTH_ROUTES.forgotPassword} className="block text-center text-sm font-semibold text-violet-700 hover:text-violet-800">
          Request a new code
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} via={via} />;
}
