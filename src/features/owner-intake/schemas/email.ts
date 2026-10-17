// Mirrors the server email rule (acquisition OwnerIntakeRequest.email): Hibernate Validator 9.1 @Email
// (AbstractEmailValidator + DomainNameUtil) and @Pattern `|[^@]+@[^@.]+(\.[^@.]+)+`. Regexes are copied from
// Hibernate (case-insensitive); the `u` flag makes `\u0080-￿` match per code point like Java, so astral
// characters such as emoji are refused. Not mirrored: Hibernate's [IPv6:...] domain literal (needs a dot to pass
// the @Pattern anyway) and Java IDN's alternative label separators (U+3002, U+FF0E, U+FF61).

const SERVER_PATTERN = /^[^@]+@[^@.]+(\.[^@.]+)+$/;

const LOCAL_ATOM = "[a-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\uffff-]";
const LOCAL_QUOTED = '"(?:[a-z0-9!#$%&\'*.(),<>\\[\\]:; @+/=?^_`{|}~\\u0080-\\uffff-]|\\\\\\\\|\\\\")+"';
const LOCAL_WORD = `(?:${LOCAL_ATOM}+|${LOCAL_QUOTED})`;
const LOCAL_PART = new RegExp(`^${LOCAL_WORD}(?:\\.${LOCAL_WORD})*$`, "iu");
const MAX_LOCAL_PART_LENGTH = 64;

// Dash-free character class, so the label pattern has one way to match and runs in linear time.
const DOMAIN_CHAR = "[a-z\\u0080-\\uffff0-9!#$%&'*+/=?^_`{|}~]";
const DOMAIN_LABEL = `${DOMAIN_CHAR}+(?:-+${DOMAIN_CHAR}+)*`;
const DOMAIN = new RegExp(`^(?:${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*|\\[[0-9]{1,3}(?:\\.[0-9]{1,3}){3}\\])$`, "iu");
const MAX_DOMAIN_ASCII_LENGTH = 255;
const MAX_LABEL_ASCII_LENGTH = 63;

/** ASCII (punycode) form of one label, as java.net.IDN.toASCII gives it; the label itself when it cannot convert. */
function labelToAscii(label: string): string {
  if (/^[\x00-\x7f]*$/.test(label)) return label;
  try {
    return new URL(`http://${label}`).hostname;
  } catch {
    return label;
  }
}

/** Java IDN.toASCII refuses a label over 63 characters; Hibernate then refuses a domain over 255. */
function fitsDns(domain: string): boolean {
  const labels = domain.split(".").map(labelToAscii);
  return (
    labels.every((label) => label.length <= MAX_LABEL_ASCII_LENGTH) &&
    labels.join(".").length <= MAX_DOMAIN_ASCII_LENGTH
  );
}

export function isValidEmail(value: string): boolean {
  if (!SERVER_PATTERN.test(value)) return false;
  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return local.length <= MAX_LOCAL_PART_LENGTH && LOCAL_PART.test(local) && DOMAIN.test(domain) && fitsDns(domain);
}
