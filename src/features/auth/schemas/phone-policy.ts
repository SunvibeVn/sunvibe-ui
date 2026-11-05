import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { PHONE_MAX_RAW_LENGTH } from "./identifier-policy";

// The phone policy of the UI (auth-email-access BR-21, BR-23, spec 4.3), the same rules as `PhoneNumber.create` of
// auth-service and held to them by identifier-corpus.json. `/max` because the smaller metadata lets invalid numbers
// through (spec A-13). The parser is heavy: only phone routes may import this module.

const COUNTRY_CODE = "84";
const TRUNK_PREFIX = "0";
const PRESENTATION_MARKS = /[ .\-()]/g;
/** What must remain once the marks are gone: anything else, a control character included, is refused. */
const COMPACT = /^\+?[0-9]+$/;

export type PhoneIdentifier = {
  /** The E.164 value accounts are compared by, for example `+84901234567`. */
  key: string;
  /** The form shown to people, for example `0901234567`. */
  national: string;
};

/** No guessing: an international prefix, a bare national number or a 0 after the country code or the trunk are refused. */
function nationalDigits(compact: string): string | null {
  let digits: string;
  if (compact.startsWith(`+${COUNTRY_CODE}`)) digits = compact.slice(COUNTRY_CODE.length + 1);
  else if (compact.startsWith(COUNTRY_CODE)) digits = compact.slice(COUNTRY_CODE.length);
  else if (compact.startsWith(TRUNK_PREFIX)) digits = compact.slice(TRUNK_PREFIX.length);
  else return null;
  // The parser would drop this 0, so 00901234567 would become the number of somebody else.
  return digits === "" || digits.startsWith(TRUNK_PREFIX) ? null : digits;
}

/** The number in its two forms, or null when the input breaks the policy. */
export function normalizePhone(raw: string): PhoneIdentifier | null {
  if (raw.length > PHONE_MAX_RAW_LENGTH) return null;
  const compact = raw.replace(PRESENTATION_MARKS, "");
  if (!COMPACT.test(compact)) return null;
  const digits = nationalDigits(compact);
  if (digits === null) return null;

  const parsed = parsePhoneNumberFromString(`+${COUNTRY_CODE}${digits}`);
  if (!parsed || parsed.country !== "VN" || !parsed.isValid()) return null;
  return { key: parsed.number, national: `${TRUNK_PREFIX}${digits}` };
}
