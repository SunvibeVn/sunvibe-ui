import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";

import type { paths } from "@/api/generated/schema";
import type { ApiCall, CallOptions } from "@/features/auth/client";
import { toPublicResult } from "@/lib/api";

import { createMedia, holdMedia, knownVersionOf, listMedia, releaseMediaHold, removeMedia } from "./media-api";
import type { SurveysDeps } from "./surveys-api";

type Sent = { method: string; url: URL; body: unknown; options?: CallOptions };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fake `callApi`: runs the request against a real typed client whose fetch records the request. */
function fakeServer(reply: (sent: Sent) => Response = () => json({})) {
  const sent: Sent[] = [];
  const client = createClient<paths>({
    baseUrl: "http://api.test",
    fetch: async (request) => {
      const text = request.method === "GET" ? "" : await request.text();
      const entry: Sent = { method: request.method, url: new URL(request.url), body: text ? JSON.parse(text) : undefined };
      sent.push(entry);
      return reply(entry);
    },
  });
  const deps: SurveysDeps = { callApi: async <T>(run: ApiCall<T>) => toPublicResult(run(client)) };
  return { sent, deps };
}

const LIST = {
  checklistId: "C1",
  setVersion: 4,
  basis: { identificationVersion: 2, conditionVersion: 1, checklistVersion: 3, stateEpoch: 7, viewDigest: "ab12" },
  items: [],
};

describe("media API (survey-media spec 7.1)", () => {
  it("lists without knownVersion the first time and with it afterwards", async () => {
    const { sent, deps } = fakeServer(() => json(LIST));
    const first = await listMedia("C1", null, deps);
    expect(first).toMatchObject({ ok: true, data: LIST });
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/survey-checklists/C1/media");
    expect(sent[0].url.search).toBe("");
    await listMedia("C1", "4.2.1.3.7.ab12", deps);
    expect(sent[1].url.searchParams.get("knownVersion")).toBe("4.2.1.3.7.ab12");
  });

  it("answers null data for 204 (unchanged since knownVersion)", async () => {
    const { deps } = fakeServer(() => new Response(null, { status: 204 }));
    expect(await listMedia("C1", "4.2.1.3.7.ab12", deps)).toMatchObject({ ok: true, status: 204, data: null });
  });

  it("knownVersionOf joins setVersion and the basis in the order of A-30", () => {
    expect(knownVersionOf(LIST)).toBe("4.2.1.3.7.ab12");
    expect(knownVersionOf({})).toBeNull();
  });

  it("creates a photo with every key present", async () => {
    const { sent, deps } = fakeServer(() => json({ media: { id: "M1" }, setVersion: 5 }, 201));
    const input = {
      uploadKey: "01JE2EUPLOAD00000000000001",
      spaceId: null,
      category: "EXTERIOR_ACCESS" as const,
      caption: null,
      sizeBytes: 1234,
      contentSha256: "a".repeat(64),
    };
    expect(await createMedia("C1", input, deps)).toMatchObject({ ok: true, status: 201, data: { setVersion: 5 } });
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/survey-checklists/C1/media");
    expect(sent[0].body).toEqual(input);
  });

  it("removes with a correction or null, holds with a reason and releases with {}", async () => {
    const { sent, deps } = fakeServer(() => json({ media: { id: "M1" }, setVersion: 6 }));
    await removeMedia("M1", { correction: null }, deps);
    await holdMedia("M1", "CREDENTIAL_EXPOSURE", deps);
    await releaseMediaHold("M1", deps);
    expect(sent.map((entry) => [entry.method, entry.url.pathname, entry.body])).toEqual([
      ["POST", "/api/v1/staff/survey-media/M1/removal", { correction: null }],
      ["POST", "/api/v1/staff/survey-media/M1/hold", { reason: "CREDENTIAL_EXPOSURE" }],
      ["POST", "/api/v1/staff/survey-media/M1/hold-release", {}],
    ]);
  });

  it("encodes ids in the path", async () => {
    const { sent, deps } = fakeServer(() => json(LIST));
    await listMedia("C/1", null, deps);
    expect(sent[0].url.pathname).toBe("/api/v1/staff/survey-checklists/C%2F1/media");
  });
});
