import type { SignUpProgress } from "./signup-progress";

/** "0901234567" → "090•••4567" is too revealing for a screen shared by accident: keep 3 digits at each end. */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return "•".repeat(phone.length);
  return `${phone.slice(0, 3)}${"•".repeat(phone.length - 6)}${phone.slice(-3)}`;
}

/** What a sign-up step shows of the address or number the visitor typed themselves: a number is masked, as ever. */
export const signUpSentTo = (progress: SignUpProgress): string =>
  progress.channel === "EMAIL" ? progress.email : maskPhone(progress.phone);
