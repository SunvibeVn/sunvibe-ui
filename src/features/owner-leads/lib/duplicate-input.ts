/** What the "original lead" field of the DUPLICATE dialog holds (spec 5.4, C-21). */
export type DuplicateInput = { kind: "code"; code: string } | { kind: "id"; id: string } | { kind: "invalid" };

const INVALID: DuplicateInput = Object.freeze({ kind: "invalid" });

/** Request code alphabet of the API: no I, O, 0, 1. */
const REQUEST_CODE = /^SV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
/** Lead ids are 26-character ULIDs; the shape is checked loosely, the server decides. */
const LEAD_PATH = /^\/workspace\/owner-leads\/([0-9A-Za-z]{26})\/?$/;

function idFromLink(text: string): string | null {
  let url: URL;
  try {
    // A relative link resolves against a placeholder origin that is never used.
    url = new URL(text, "http://workspace.invalid");
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Query and hash are not part of `pathname`.
  // ULIDs are upper-case Crockford base32 and the server compares ids case-sensitively.
  return LEAD_PATH.exec(url.pathname)?.[1]?.toUpperCase() ?? null;
}

/**
 * Reads the text pasted for the original of a DUPLICATE: a request code (outer spaces trimmed, any case) or a
 * workspace lead link, absolute of any host or relative, whose path is `/workspace/owner-leads/<id>`.
 */
export function parseDuplicateInput(raw: string): DuplicateInput {
  const text = raw.trim();
  if (text === "") return INVALID;

  const code = text.toUpperCase();
  if (REQUEST_CODE.test(code)) return { kind: "code", code };

  // Only something that looks like a link is tried as one; a code with a typo or an inner space is invalid.
  if (!text.includes("/") || /\s/.test(text)) return INVALID;
  const id = idFromLink(text);
  return id === null ? INVALID : { kind: "id", id };
}
