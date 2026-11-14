// The server's rule (PhoneNumberDetector, survey-schedule spec A-14 as amended for SV-212 by the phone detector spec
// 2026-11-15, section 4): free text staff type must not hold a Vietnamese phone number, so a third party's number is
// never stored (survey BR-4). The UI checks the same way so the refusal shows at the field before saving; the server
// stays the authority. The number is matched on the text itself: a candidate never starts or ends inside a run of
// digits glued by a dot or a dash; a space and a colon are edges; a valid date or clock time is never part of a number.

/** Invisible format characters (zero-width space, soft hyphen, word joiner, direction marks). */
const INVISIBLE = /\p{Cf}/gu;
/** A valid date d.m.yyyy or d-m-yyyy (one repeated dot or dash, year 1900-2099), not next to a digit; masked. */
const DATE = /(?<!\d)(?:0?[1-9]|[12]\d|3[01])([.\p{Pd}−])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}(?!\d)/gu;
/** A clock time h:mm or hh:mm (hour 0-23), with no digit or colon on either side; masked. */
const TIME = /(?<![\d:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\d:])/gu;
/**
 * An optional "+", then 84 or 0, then 9 or 10 digits, with spaces, dots, dashes or brackets allowed between them. It
 * does not start after a digit, or after a dash or dot that follows a digit, and does not end before a digit, or before
 * a dash or dot that comes before a digit.
 */
const PHONE =
  /(?<!\d)(?<!\d[\p{Pd}−.])(?:\+[\s\p{Z}\p{Pd}−.()]*)?(?:8[\s\p{Z}\p{Pd}−.()]*4|0)(?:[\s\p{Z}\p{Pd}−.()]*\d){9,10}(?!\d)(?![\p{Pd}−.]\d)/u;
/** Put where a date or a clock time was, so the match sees neither a digit nor a separator there. */
const MASK = "_";

/** True when `text` holds a Vietnamese phone number; false for blank text. */
export function containsPhoneNumber(text: string): boolean {
  if (text.trim() === "") return false;
  // NFKC turns no-break and thin spaces into plain spaces and full-width digits into ASCII ones.
  const compatible = text.normalize("NFKC").replace(INVISIBLE, "");
  const masked = compatible.replace(DATE, MASK).replace(TIME, MASK);
  return PHONE.test(masked);
}
