// New spaces, hazards and other items get their ids in the browser (survey-checklist A-23): a ULID, unique within the
// checklist, so a retried save that added entries is the same save (A-17). A genuinely new entry always gets a new id
// (A-29: never a reused one, never a new one to avoid the correction rule).

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID: 48 bits of milliseconds then 80 random bits, in Crockford base32 (26 characters). */
export function newClientId(now: number = Date.now()): string {
  let time = "";
  let rest = Math.floor(now);
  for (let index = 0; index < 10; index += 1) {
    time = CROCKFORD[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let random = "";
  for (const byte of bytes) random += CROCKFORD[byte % 32];
  return time + random;
}
