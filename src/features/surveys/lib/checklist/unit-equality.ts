// Values the user did not change may come back in another form (survey-checklist Review Focus 1): text typed on a Mac
// arrives in NFD, a note gains a trailing space, a blank optional text is the same as none. They compare equal here,
// as the server's normalisation makes them (A-17), so the page neither asks for a correction nor counts a change.

function normalise(value: unknown): unknown {
  if (typeof value === "string") {
    const text = value.normalize("NFC").trim();
    return text === "" ? null : text;
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, normalise(item)]),
    );
  }
  return value === undefined ? null : value;
}

/** True when two unit values are the same after the server's normalisation (NFC, trimmed, blank text as none). */
export function sameUnit(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}
