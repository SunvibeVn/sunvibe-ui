"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { englishSessionTexts } from "../lib/english-session-texts";
import { verifyPhoneDeps } from "../lib/signed-in-browser";
import { useSignedInLoad } from "../lib/use-signed-in-load";
import { loadVerifyPhone } from "../lib/verify-phone-flow";
import { useSession } from "../session/use-session";
import { FormSkeleton } from "./form-skeleton";
import { LoadError } from "./load-error";
import { RequireSession } from "./require-session";
import { VerifyPhoneForm } from "./verify-phone-form";

// The account's phone is read only in the browser, with the tab's token (auth-browser-session §4.7).

/** Phone verification of the signed-in user; an account already verified goes to `/account`. */
export function VerifyPhoneSection() {
  return (
    <RequireSession texts={englishSessionTexts}>
      <VerifyPhoneForUser />
    </RequireSession>
  );
}

/** Loads again for another signed-in user. */
function VerifyPhoneForUser() {
  const { user } = useSession();
  return <VerifyPhoneContent key={user?.userId ?? ""} />;
}

const loadForTab = () => loadVerifyPhone(verifyPhoneDeps());

function VerifyPhoneContent() {
  const router = useRouter();
  const onRedirect = useCallback((to: string) => router.replace(to), [router]);
  const { view, retry } = useSignedInLoad(loadForTab, onRedirect);

  if (view.kind === "loading") return <FormSkeleton fields={1} />;
  if (view.kind === "error") return <LoadError onRetry={retry} />;
  // RequireSession shows the session's state (signed out, unavailable) from the store.
  if (view.kind === "none") return null;
  return <VerifyPhoneForm maskedPhone={view.maskedPhone} />;
}
