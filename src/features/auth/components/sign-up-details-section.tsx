import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { maskPhone } from "../lib/mask-phone";
import { isFuture } from "../lib/signup-progress";
import { readSignUpEntry } from "../session/cookies";
import { SignUpDetailsForm } from "./sign-up-details-form";

/** Reads the sign-up cookie, so render it inside <Suspense>. Sends visitors who skipped a step back to it. */
export async function SignUpDetailsSection() {
  const entry = await readSignUpEntry();
  if (!entry) redirect(AUTH_ROUTES.signUp);
  if (!entry.registrationToken) redirect(AUTH_ROUTES.signUpVerify);
  if (!isFuture(entry.tokenExpiresAt)) redirect(`${AUTH_ROUTES.signUp}?expired=1`);
  return <SignUpDetailsForm maskedPhone={maskPhone(entry.phone)} />;
}
