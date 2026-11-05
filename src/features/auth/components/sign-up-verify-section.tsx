"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signUpSentTo } from "../lib/mask-phone";
import { useSignUpStep } from "../lib/sign-up-browser";
import type { SignUpConflict } from "../lib/sign-up-flow";
import { sessionStorageOf } from "../lib/session-storage";
import { leaveSignUpStep, signUpIdentifier } from "../lib/signup-progress";
import { FormSkeleton } from "./form-skeleton";
import { SignUpConflictNotice } from "./sign-up-conflict";
import { SignUpVerifyForm } from "./sign-up-verify-form";

/** Reads this tab's sign-up progress once mounted. Sends visitors who skipped a step, or whose token ran out, back. */
export function SignUpVerifySection() {
  const router = useRouter();
  const step = useSignUpStep();
  // A refused address leaves no progress, so the way out is kept here: reading the step again, as a return to the tab
  // does, must not send the visitor to the first step without it. A new sign-up takes over.
  const [refused, setRefused] = useState<{ conflict: SignUpConflict; message?: string } | null>(null);
  const inProgress = step?.kind === "code" || step?.kind === "details";
  const showRefused = refused !== null && !inProgress;

  useEffect(() => {
    if (!step || showRefused) return;
    leaveSignUpStep(step, "code", { storage: sessionStorageOf(window), replace: (path) => router.replace(path) });
  }, [router, step, showRefused]);

  if (showRefused) return <SignUpConflictNotice conflict={refused.conflict} message={refused.message} />;
  if (step?.kind !== "code") return <FormSkeleton fields={1} />;
  return (
    // Next keeps this route's state between visits: another address starts with a fresh form and its own wait.
    <SignUpVerifyForm
      key={signUpIdentifier(step.progress)}
      channel={step.progress.channel}
      sentTo={signUpSentTo(step.progress)}
      resendAvailableAt={step.progress.resendAvailableAt}
      onRefused={setRefused}
    />
  );
}
