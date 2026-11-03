// The SHA-256 of a photo before its create (survey-media spec 6.2, A-5): hex for `contentSha256`, base64 for the RFC
// 9530 `Content-Digest` of the upload. WebCrypto where it exists; on a plain-HTTP origin (the LAN test set-up)
// `crypto.subtle` is missing, so the incremental WASM SHA-256 of hash-wasm reads the file in chunks instead.

export type ContentHash = { hex: string; base64: string };

export type ContentHashOptions = {
  /** WebCrypto to use; null forces the WASM path (tests, and browsers without a secure context). */
  subtle?: SubtleCrypto | null;
  /** Chunk size of the WASM path. */
  chunkBytes?: number;
};

const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function defaultSubtle(): SubtleCrypto | null {
  return typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle ? globalThis.crypto.subtle : null;
}

async function wasmDigest(blob: Blob, chunkBytes: number): Promise<Uint8Array> {
  // Loaded only when needed: a secure context never downloads the WASM module.
  const { createSHA256 } = await import("hash-wasm");
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    hasher.update(new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer()));
  }
  return hasher.digest("binary");
}

/** Hashes the bytes of `blob`; the same digest on both paths. */
export async function sha256OfBlob(blob: Blob, options: ContentHashOptions = {}): Promise<ContentHash> {
  const subtle = options.subtle === undefined ? defaultSubtle() : options.subtle;
  const digest =
    subtle !== null
      ? new Uint8Array(await subtle.digest("SHA-256", await blob.arrayBuffer()))
      : await wasmDigest(blob, options.chunkBytes ?? DEFAULT_CHUNK_BYTES);
  return { hex: toHex(digest), base64: toBase64(digest) };
}

/** The `Content-Digest` header value of a base64 SHA-256 (RFC 9530). */
export function contentDigestHeader(base64: string): string {
  return `sha-256=:${base64}:`;
}
