/** The parts of Web Crypto that key generation needs; `randomUUID` exists in secure contexts only. */
export type RandomSource = {
  randomUUID?: () => string;
  getRandomValues: (array: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
};

/**
 * A random v4 UUID, which fits the server's `^[A-Za-z0-9_-]{8,64}$` (handoff 2.3). Uses `crypto.randomUUID()`;
 * outside a secure context (a phone testing the dev server over plain http) builds the same format from
 * `getRandomValues`, which every browser has.
 */
export function newIdempotencyKey(source: RandomSource = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type IdempotencyKeys = {
  /** The key of this serialized body: the same one for every retry, a new one as soon as the body differs. */
  keyFor(body: string): string;
  /** Gives the current body a new key (after 409 IDEMPOTENCY_KEY_REUSED). */
  renew(): void;
  /** Forgets the body and its key (after a success). */
  reset(): void;
};

/** Holds the Idempotency-Key of the last body sent (handoff 2.3). Only the latest body is remembered. */
export function createIdempotencyKeys(newKey: () => string = () => newIdempotencyKey()): IdempotencyKeys {
  let current: { body: string; key: string } | undefined;
  return {
    keyFor(body) {
      if (current?.body !== body) current = { body, key: newKey() };
      return current.key;
    },
    renew() {
      if (current) current = { body: current.body, key: newKey() };
    },
    reset() {
      current = undefined;
    },
  };
}
