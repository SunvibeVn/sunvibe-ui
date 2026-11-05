"use client";

import { useResetSectionView } from "../lib/password-reset-browser";
import { FormSkeleton } from "./form-skeleton";
import { ResetLinkInvalid } from "./reset-link-invalid";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * The reset form, or the invalid-link notice when this tab holds no reset token. `fromLink` (`via=sms`) renders the form
 * on the server already, so a submit before hydration works. The token of an e-mail link is in the fragment, which the
 * server never sees: that page shows a placeholder until mount moves it into this tab's storage.
 */
export function ResetPasswordSection({ via, fromLink }: { via: "email" | "sms"; fromLink: boolean }) {
  const view = useResetSectionView(fromLink);

  if (view === "invalid") return <ResetLinkInvalid />;
  if (view === "pending") return <FormSkeleton fields={3} />;
  return <ResetPasswordForm via={via} />;
}
