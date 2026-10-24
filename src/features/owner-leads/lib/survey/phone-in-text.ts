// The server's rule (PhoneNumberDetector, survey-schedule spec A-14): free text staff type must not hold a Vietnamese
// phone number, so a third party's number is never stored (survey BR-4). The UI checks the same way so the refusal
// shows at the field before saving; the server stays the authority.

/**
 * Separators between two digits (or between "+" or "(" and a digit): spaces of any kind, dots, any dash, the minus
 * sign and brackets. Removed before matching.
 */
const SEPARATORS_BETWEEN_DIGITS = /(?<=[\d+])[\s\p{Z}\p{Pd}−.()]+(?=[\d(+])/gu;
/** Invisible format characters (zero-width space, soft hyphen, word joiner, direction marks). */
const INVISIBLE = /\p{Cf}/gu;
/** An optional +84, 84 or 0, then 9 or 10 digits; a longer run of digits (a code, an account) is not a number. */
const PHONE = /(?<!\d)(?:\+?84|0)\d{9,10}(?!\d)/;

/** True when `text` holds a Vietnamese phone number; false for blank text. */
export function containsPhoneNumber(text: string): boolean {
  if (text.trim() === "") return false;
  // NFKC turns no-break and thin spaces into plain spaces and full-width digits into ASCII ones.
  const compatible = text.normalize("NFKC").replace(INVISIBLE, "");
  return PHONE.test(compatible.replace(SEPARATORS_BETWEEN_DIGITS, ""));
}
