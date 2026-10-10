/** Digits only, at most `maxLength` of them: "123 456" or "123-456" → "123456". */
export function sanitizeOtp(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, Math.max(0, maxLength));
}
