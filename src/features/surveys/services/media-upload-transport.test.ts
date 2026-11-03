import { describe, expect, it } from "vitest";

import type { BearerUploadInput, BearerUploadResult } from "@/features/auth/client";

import { createUploadTransport, UPLOAD_STALL_MS } from "./media-upload-transport";

// The XMLHttpRequest itself, the token, the 401 rule, the origin check, the stall and the aborts are the auth
// client's (`uploadWithBearer`, tested in api-client.test.ts); here: what the photo upload asks of it.

function setup(answer: BearerUploadResult = { ok: true, status: 202, replayed: false, data: { setVersion: 5 } }) {
  const sent: BearerUploadInput[] = [];
  const upload = createUploadTransport({
    uploadWithBearer: async (input) => {
      sent.push(input);
      return answer;
    },
  });
  return { sent, upload };
}

const FILE = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
const DIGEST = "sha-256=:n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=:";

describe("media upload transport (survey-media spec 6.2, PD-11)", () => {
  it("onlyApiOriginNoCredentials: a path of the API, octet-stream and the digest; never a URL or a token of its own", async () => {
    const { sent, upload } = setup();
    expect(await upload({ mediaId: "M1", file: FILE, contentDigest: DIGEST })).toMatchObject({ ok: true, status: 202 });
    expect(sent[0]).toMatchObject({
      path: "/api/v1/staff/survey-media/M1/content",
      body: FILE,
      headers: { "Content-Type": "application/octet-stream", "Content-Digest": DIGEST },
      stallMs: UPLOAD_STALL_MS,
    });
    expect(Object.keys(sent[0].headers).map((name) => name.toLowerCase())).not.toContain("authorization");
  });

  it("encodes the id so the path never leaves the photo's content", async () => {
    const { sent, upload } = setup();
    await upload({ mediaId: "../../evil?x=1", file: FILE, contentDigest: DIGEST });
    expect(sent[0].path).toBe("/api/v1/staff/survey-media/..%2F..%2Fevil%3Fx%3D1/content");
  });

  it("stallAfter60s_networkStateUnknown and progressEvents: the 60 s stall, the progress and the abort go along", async () => {
    const { sent, upload } = setup();
    const controller = new AbortController();
    const onProgress = () => undefined;
    await upload({ mediaId: "M1", file: FILE, contentDigest: DIGEST, signal: controller.signal, onProgress });
    expect(UPLOAD_STALL_MS).toBe(60_000);
    expect(sent[0].signal).toBe(controller.signal);
    expect(sent[0].onProgress).toBe(onProgress);
  });

  it("passes every outcome through: network (state unknown), aborted, signed-out, an error by code", async () => {
    for (const answer of [
      { ok: false, kind: "network" },
      { ok: false, kind: "aborted" },
      { ok: false, kind: "signed-out" },
      { ok: false, kind: "unavailable" },
      { ok: false, kind: "http", status: 429, code: "RATE_LIMITED", fieldErrors: [{ field: "bodies", message: "x" }], retryAfterSeconds: 5 },
    ] as const satisfies readonly BearerUploadResult[]) {
      const { upload } = setup(answer);
      expect(await upload({ mediaId: "M1", file: FILE, contentDigest: DIGEST })).toEqual(answer);
    }
  });
});
