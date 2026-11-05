import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import type { SignUpConflict } from "../lib/sign-up-flow";

const linkClass = "font-semibold text-violet-700 hover:text-violet-800";

/** A proved address that cannot sign up, and the way out (auth-email-access spec 4.8): never a dead end. */
export function SignUpConflictNotice({ conflict, message }: { conflict: SignUpConflict; message?: string }) {
  return (
    <div className="space-y-4">
      <Alert tone="error">{message}</Alert>
      {conflict === "account-exists" ? (
        <p className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link href={AUTH_ROUTES.login} className={linkClass}>
            Log in
          </Link>
          <Link href={AUTH_ROUTES.forgotPassword} className={linkClass}>
            Reset your password
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm">
          <Link href={AUTH_ROUTES.signUp} className={linkClass}>
            Use another email
          </Link>
        </p>
      )}
    </div>
  );
}
