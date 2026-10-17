"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { useResetSectionView } from "../lib/password-reset-browser";
import { FormSkeleton } from "./form-skeleton";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * The reset form, or the invalid-link notice when this tab holds no reset token. `fromLink` (the address carries a
 * token or `via=sms`) renders the form on the server already, so a submit before hydration works; the token itself is
 * read from this tab's storage after mount, never from the page props.
 */
export function ResetPasswordSection({ via, fromLink }: { via: "email" | "sms"; fromLink: boolean }) {
  const view = useResetSectionView(fromLink);

  if (view === "invalid") {
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
  if (view === "pending") return <FormSkeleton fields={3} />;
  return <ResetPasswordForm via={via} />;
}
