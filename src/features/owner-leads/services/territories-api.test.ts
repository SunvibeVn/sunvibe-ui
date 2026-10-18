import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";

import type { paths } from "@/api/generated/schema";
import type { ApiCall } from "@/features/auth/client";
import { toPublicResult } from "@/lib/api";

import { assignTerritory, listTerritories, unassignTerritory, type TerritoriesDeps } from "./territories-api";

function fakeServer(status = 200, body: unknown = {}) {
  const sent: { method: string; url: URL; body: unknown }[] = [];
  const client = createClient<paths>({
    baseUrl: "http://api.test",
    fetch: async (request) => {
      const text = request.method === "PUT" ? await request.text() : "";
      sent.push({ method: request.method, url: new URL(request.url), body: text ? JSON.parse(text) : undefined });
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    },
  });
  const deps: TerritoriesDeps = { callApi: async <T>(run: ApiCall<T>) => toPublicResult(run(client)) };
  return { sent, deps };
}

describe("territories services", () => {
  it("listTerritories GETs the wards of province 48", async () => {
    const { sent, deps } = fakeServer(200, []);
    const result = await listTerritories(deps);
    expect(result.ok).toBe(true);
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/sale-territories");
    expect(sent[0].url.searchParams.get("provinceCode")).toBe("48");
  });

  it("assignTerritory PUTs the user id for the ward", async () => {
    const { sent, deps } = fakeServer();
    await assignTerritory("20242", "U1", deps);
    expect(sent[0].method).toBe("PUT");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/sale-territories/20242");
    expect(sent[0].body).toEqual({ userId: "U1" });
  });

  it("unassignTerritory DELETEs the ward and accepts 204", async () => {
    const { sent, deps } = fakeServer(204);
    const result = await unassignTerritory("20242", deps);
    expect(result.ok).toBe(true);
    expect(sent[0].method).toBe("DELETE");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/sale-territories/20242");
  });
});
