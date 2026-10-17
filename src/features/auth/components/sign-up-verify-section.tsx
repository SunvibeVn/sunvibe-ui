"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { maskPhone } from "../lib/mask-phone";
import { useSignUpStep } from "../lib/sign-up-browser";
import { sessionStorageOf } from "../lib/session-storage";
import { leaveSignUpStep } from "../lib/signup-progress";
import { FormSkeleton } from "./form-skeleton";
import { SignUpVerifyForm } from "./sign-up-verify-form";

/** Reads this tab's sign-up progress once mounted. Sends visitors who skipped a step, or whose token ran out, back. */
export function SignUpVerifySection() {
  const router = useRouter();
  const step = useSignUpStep();

  useEffect(() => {
    if (!step) return;
    leaveSignUpStep(step, "code", { storage: sessionStorageOf(window), replace: (path) => router.replace(path) });
  }, [router, step]);

  if (step?.kind !== "code") return <FormSkeleton fields={1} />;
  return (
    <SignUpVerifyForm maskedPhone={maskPhone(step.progress.phone)} resendAvailableAt={step.progress.resendAvailableAt} />
  );
}
