import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { maskPhone } from "../lib/mask-phone";
import { readSignUpEntry } from "../session/cookies";
import { SignUpVerifyForm } from "./sign-up-verify-form";

/** Reads the sign-up cookie, so render it inside <Suspense>. Sends visitors who skipped a step back to it. */
export async function SignUpVerifySection() {
  const entry = await readSignUpEntry();
  if (!entry) redirect(AUTH_ROUTES.signUp);
  if (entry.registrationToken) redirect(AUTH_ROUTES.signUpDetails);
  return <SignUpVerifyForm maskedPhone={maskPhone(entry.phone)} resendAvailableAt={entry.resendAvailableAt} />;
}
