import { containsPhoneNumber } from "@/lib/text/phone-in-text";

// The free text staff type into the intake (plan Global Constraints, the server's IntakeText): NFC and trimmed, without a
// phone number or U+0000. The server stays the authority; this shows the refusal at the field before saving.

export const REASON_MAX = 2000;
export const NOTE_MAX = 500;
export const QUERY_MAX = 100;

export type TextProblem = "required" | "tooLong" | "phone" | "invalid";

/** The text as the server keeps it. */
export const cleanText = (value: string): string => value.normalize("NFC").trim();

/** What is wrong with a required text of 1..max characters; null when it is fine. */
export function textProblem(value: string, max: number): TextProblem | null {
  if (value.includes("\u0000")) return "invalid";
  const text = cleanText(value);
  if (text === "") return "required";
  if (text.length > max) return "tooLong";
  return containsPhoneNumber(text) ? "phone" : null;
}
