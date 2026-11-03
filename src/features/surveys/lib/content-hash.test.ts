import { describe, expect, it } from "vitest";

import { contentDigestHeader, sha256OfBlob } from "./content-hash";

// FIPS 180-2 test vector: SHA-256("abc").
const ABC_HEX = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const ABC_BASE64 = "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=";

const blobOf = (text: string) => new Blob([new TextEncoder().encode(text)]);

describe("content hash (survey-media spec 6.2: contentSha256 and Content-Digest)", () => {
  it("hashes with WebCrypto: hex for contentSha256, base64 for the digest", async () => {
    expect(await sha256OfBlob(blobOf("abc"))).toEqual({ hex: ABC_HEX, base64: ABC_BASE64 });
  });

  it("noSubtleCrypto_usesWasmSameDigest: the plain-HTTP LAN fallback gives the same digest", async () => {
    expect(await sha256OfBlob(blobOf("abc"), { subtle: null })).toEqual({ hex: ABC_HEX, base64: ABC_BASE64 });
  });

  it("noSubtleCrypto_usesWasmSameDigest: reads the file in chunks", async () => {
    const big = new Uint8Array(300_000).map((_, index) => index % 251);
    const blob = new Blob([big]);
    const subtle = await sha256OfBlob(blob);
    expect(await sha256OfBlob(blob, { subtle: null, chunkBytes: 65_536 })).toEqual(subtle);
  });

  it("formats the RFC 9530 Content-Digest header", () => {
    expect(contentDigestHeader(ABC_BASE64)).toBe(`sha-256=:${ABC_BASE64}:`);
  });
});
