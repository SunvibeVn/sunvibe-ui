// Contact links of the lead detail (US-4 AC-1, AC-2; SEC-M1). The values come from an owner-filled form: a link is
// made only from a value that cannot add anything to the mail or the call; anything else is shown as plain text.

/** Characters that would add headers, recipients or a fragment to a `mailto:` URL (or hide one, `%`). */
const MAILTO_UNSAFE = /[?&#%,;\s]/;

/** A `mailto:` URL for one plain address, percent-encoded where needed; null when the value is not safe to link. */
export function mailtoHref(email: string): string | null {
  const value = email.trim();
  if (value === "" || MAILTO_UNSAFE.test(value)) return null;
  if (value.split("@").length !== 2) return null;
  return `mailto:${encodeURI(value)}`;
}

const PHONE = /^\+?[0-9 ]{6,20}$/;

/** A `tel:` URL for digits (spaces and a leading `+` allowed, spaces dropped); null for anything else. */
export function telHref(phone: string): string | null {
  const value = phone.trim();
  if (!PHONE.test(value)) return null;
  return `tel:${value.replace(/ /g, "")}`;
}
