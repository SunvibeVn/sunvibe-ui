import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";

import type { paths } from "@/api/generated/schema";
import type { ApiCall, CallOptions } from "@/features/auth/client";
import { toPublicResult } from "@/lib/api";

import { getMediaImage, IMAGE_TIMEOUT_MS } from "./media-image-client";
import type { SurveysDeps } from "./surveys-api";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function fakeServer(reply: () => Response) {
  const urls: URL[] = [];
  const requests: Request[] = [];
  const options: Array<CallOptions | undefined> = [];
  const client = createClient<paths>({
    baseUrl: "http://api.test",
    fetch: async (request) => {
      urls.push(new URL(request.url));
      requests.push(request);
      return reply();
    },
  });
  const deps: SurveysDeps = {
    callApi: async <T>(run: ApiCall<T>, callOptions?: CallOptions) => {
      options.push(callOptions);
      return toPublicResult(run(client));
    },
  };
  return { urls, requests, options, deps };
}

const jpeg = (type = "image/jpeg") => new Response(JPEG, { status: 200, headers: { "Content-Type": type } });

describe("media image client (survey-media spec 6.2 images, A-25)", () => {
  it("reads a variant as an image/jpeg blob", async () => {
    const { urls, deps } = fakeServer(() => jpeg());
    const result = await getMediaImage("M1", "preview", {}, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("image/jpeg");
    expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(JPEG);
    expect(urls[0].pathname).toBe("/api/v1/staff/survey-media/M1/content/preview");
    expect(urls[0].search).toBe("");
  });

  it("SM-FE-08: asks no cache and carries the caller's signal", async () => {
    const { requests, deps } = fakeServer(() => jpeg());
    const controller = new AbortController();
    await getMediaImage("M1", "thumbnail", { signal: controller.signal }, deps);
    expect(requests[0].cache).toBe("no-store");
    expect(requests[0].signal.aborted).toBe(false);
    controller.abort();
    expect(requests[0].signal.aborted).toBe(true);
  });

  it("SM-FE-08: a read already aborted sends nothing", async () => {
    const { urls, deps } = fakeServer(() => jpeg());
    const controller = new AbortController();
    controller.abort();
    const result = await getMediaImage("M1", "preview", { signal: controller.signal }, deps);
    expect(result.ok).toBe(false);
    expect(urls).toHaveLength(0);
  });

  it("asks a download only of the full variant", async () => {
    const { urls, deps } = fakeServer(() => jpeg());
    await getMediaImage("M1", "full", { download: true }, deps);
    await getMediaImage("M1", "thumbnail", { download: true }, deps);
    expect(urls[0].searchParams.get("download")).toBe("true");
    expect(urls[1].search).toBe("");
  });

  it("nonJpeg_refused: any other type gives no blob", async () => {
    for (const type of ["text/html", "image/svg+xml", "image/png", "application/octet-stream"]) {
      const { deps } = fakeServer(() => jpeg(type));
      expect(await getMediaImage("M1", "preview", {}, deps)).toEqual({ ok: false, kind: "not-jpeg" });
    }
    const withParameters = fakeServer(() => jpeg("image/jpeg; charset=binary"));
    expect((await getMediaImage("M1", "preview", {}, withParameters.deps)).ok).toBe(true);
  });

  it("timeoutsPerVariant: 60 s for thumbnail and preview, 300 s for full", async () => {
    const { options, deps } = fakeServer(() => jpeg());
    await getMediaImage("M1", "thumbnail", {}, deps);
    await getMediaImage("M1", "preview", {}, deps);
    await getMediaImage("M1", "full", {}, deps);
    expect(options.map((option) => option?.timeoutMs)).toEqual([60_000, 60_000, 300_000]);
    expect(IMAGE_TIMEOUT_MS).toEqual({ thumbnail: 60_000, preview: 60_000, full: 300_000 });
  });

  it("passes an error answer through for its code", async () => {
    const { deps } = fakeServer(
      () =>
        new Response(JSON.stringify({ code: "MEDIA_NOT_AVAILABLE", message: "x", errors: [] }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
    );
    expect(await getMediaImage("M1", "preview", {}, deps)).toMatchObject({
      ok: false,
      kind: "http",
      status: 409,
      code: "MEDIA_NOT_AVAILABLE",
    });
  });
});
