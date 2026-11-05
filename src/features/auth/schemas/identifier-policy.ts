// The email policy of the UI (auth-email-access BR-20, BR-23, spec 4.2), the same rules as `Email.create` of auth-service
// and held to them by identifier-corpus.json. It has no dependency, so public pages stay light: the phone policy lives
// in phone-policy.ts, imported only by phone routes.

/** Longest input taken at all, before the spaces around it are removed. */
export const EMAIL_MAX_RAW_LENGTH = 320;
export const EMAIL_MAX_LENGTH = 254;
export const EMAIL_MAX_LOCAL_PART_LENGTH = 64;
/** Longest phone input taken at all, before the marks are removed. */
export const PHONE_MAX_RAW_LENGTH = 32;
/** auth-service refuses a longer password at sign-in and at every re-entry. */
export const PASSWORD_MAX_LENGTH = 256;

const MAX_LABEL_LENGTH = 63;
export const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const NOT_PRINTABLE_ASCII = /[^ -~]/;
const ATOM = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
const LABEL = /^[a-z0-9-]+$/;
const ALL_DIGITS = /^[0-9]+$/;

/** U+0020 only: a tab or NBSP around an address is refused, not cleaned. */
const stripSpaces = (raw: string): string => raw.replace(/^ +/, "").replace(/ +$/, "");

/** Dot-separated atoms of RFC 5322 atext: no quotes, and no leading, trailing or double dot. */
const isDotAtom = (localPart: string): boolean => localPart.split(".").every((atom) => ATOM.test(atom));

const isLabel = (label: string): boolean =>
  label.length >= 1 &&
  label.length <= MAX_LABEL_LENGTH &&
  LABEL.test(label) &&
  !label.startsWith("-") &&
  !label.endsWith("-");

/** At least two labels; the last one has two characters or more and is not all digits, which refuses an IP. */
function isDomain(domain: string): boolean {
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every(isLabel)) return false;
  const top = labels[labels.length - 1];
  return top.length >= 2 && !ALL_DIGITS.test(top);
}

/** The canonical address accounts are compared by, or null when the input breaks the policy. */
export function normalizeEmail(raw: string): string | null {
  if (raw.length > EMAIL_MAX_RAW_LENGTH || CONTROL_CHARACTER.test(raw)) return null;
  const trimmed = stripSpaces(raw);
  if (trimmed === "" || NOT_PRINTABLE_ASCII.test(trimmed)) return null;

  const address = trimmed.toLowerCase();
  const at = address.indexOf("@");
  if (at < 0 || at !== address.lastIndexOf("@") || address.length > EMAIL_MAX_LENGTH) return null;

  const localPart = address.slice(0, at);
  if (localPart === "" || localPart.length > EMAIL_MAX_LOCAL_PART_LENGTH || !isDotAtom(localPart)) return null;
  return isDomain(address.slice(at + 1)) ? address : null;
}
