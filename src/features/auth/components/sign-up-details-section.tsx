"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signUpSentTo } from "../lib/mask-phone";
import { useSignUpStep } from "../lib/sign-up-browser";
import { sessionStorageOf } from "../lib/session-storage";
import { leaveSignUpStep, signUpIdentifier } from "../lib/signup-progress";
import { FormSkeleton } from "./form-skeleton";
import { SignUpDetailsForm } from "./sign-up-details-form";

/** Reads this tab's sign-up progress once mounted. Sends visitors who skipped a step, or whose token ran out, back. */
export function SignUpDetailsSection() {
  const router = useRouter();
  const step = useSignUpStep();

  useEffect(() => {
    if (!step) return;
    leaveSignUpStep(step, "details", { storage: sessionStorageOf(window), replace: (path) => router.replace(path) });
  }, [router, step]);

  if (step?.kind !== "details") return <FormSkeleton fields={3} />;
  // Next keeps this route's state between visits: another address starts with a fresh form.
  return <SignUpDetailsForm key={signUpIdentifier(step.progress)} verified={signUpSentTo(step.progress)} />;
}
