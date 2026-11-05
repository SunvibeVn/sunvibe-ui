import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";

/** No usable reset token in this tab, and the way to a new one. */
export function ResetLinkInvalid() {
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
