import { describe, expect, it } from "vitest";

import { createPublicClient } from "@/lib/api";

import { loadProvinces, loadWards } from "./catalog";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** A client that throws before any request, like createPublicClient() without NEXT_PUBLIC_API_URL in production. */
const THROWING_CLIENT = {
  GET: () => {
    throw new Error("Missing environment variable: NEXT_PUBLIC_API_URL");
  },
} as unknown as ReturnType<typeof createPublicClient>;

function stub(respond: (request: Request) => Promise<Response> | Response) {
  const requests: Request[] = [];
  const client = createPublicClient({
    baseUrl: "http://api.test",
    fetch: async (request) => {
      requests.push(request);
      return respond(request);
    },
  });
  return { client, requests };
}

// Server order of handoff section 6 (JDK Vietnamese collator; "Hoàng Sa" between "Hòa Khánh" and "Hòa Tiến").
const DA_NANG_WARDS = [
  { code: "20275", name: "An Hải", type: "WARD" },
  { code: "w-02", name: "An Khê", type: "WARD" },
  { code: "20308", name: "Bà Nà", type: "COMMUNE" },
  { code: "w-04", name: "Cẩm Lệ", type: "WARD" },
  { code: "w-05", name: "Hải Châu", type: "WARD" },
  { code: "w-06", name: "Hải Vân", type: "WARD" },
  { code: "w-07", name: "Hòa Cường", type: "WARD" },
  { code: "w-08", name: "Hòa Khánh", type: "WARD" },
  { code: "20333", name: "Hoàng Sa", type: "SPECIAL_ZONE" },
  { code: "w-10", name: "Hòa Tiến", type: "COMMUNE" },
  { code: "w-11", name: "Hòa Vang", type: "COMMUNE" },
  { code: "w-12", name: "Hòa Xuân", type: "WARD" },
  { code: "w-13", name: "Liên Chiểu", type: "WARD" },
  { code: "w-14", name: "Ngũ Hành Sơn", type: "WARD" },
  { code: "w-15", name: "Sơn Trà", type: "WARD" },
  { code: "w-16", name: "Thanh Khê", type: "WARD" },
] as const;

describe("loadProvinces", () => {
  it("returns the provinces as received", async () => {
    const { client, requests } = stub(() => json(200, [{ code: "48", name: "Đà Nẵng" }]));
    expect(await loadProvinces(client)).toEqual({ status: "ready", items: [{ code: "48", name: "Đà Nẵng" }] });
    expect(requests[0].url).toBe("http://api.test/api/v1/public/provinces");
    expect(requests[0].method).toBe("GET");
  });

  it("maps an empty list to empty", async () => {
    const { client } = stub(() => json(200, []));
    expect(await loadProvinces(client)).toEqual({ status: "empty" });
  });

  it("maps a 500 to failed with the correlation id", async () => {
    const { client } = stub(() => json(500, { code: "INTERNAL_ERROR", errors: [], correlationId: "corr-500-0001" }));
    expect(await loadProvinces(client)).toEqual({ status: "failed", correlationId: "corr-500-0001" });
  });

  it("maps a network failure to failed without a correlation id", async () => {
    const { client } = stub(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await loadProvinces(client)).toEqual({ status: "failed" });
  });

  it("a throwing client is failed", async () => {
    await expect(loadProvinces(THROWING_CLIENT)).resolves.toEqual({ status: "failed" });
  });

  it("skips null entries in a 200 list", async () => {
    const { client } = stub(() => json(200, [null, { code: "48", name: "Đà Nẵng" }]));
    expect(await loadProvinces(client)).toEqual({ status: "ready", items: [{ code: "48", name: "Đà Nẵng" }] });
  });
});

describe("loadWards", () => {
  it("returns the 16 wards of Đà Nẵng in server order, never re-sorted", async () => {
    const { client, requests } = stub(() => json(200, DA_NANG_WARDS));
    const result = await loadWards("48", client);
    expect(requests[0].url).toBe("http://api.test/api/v1/public/provinces/48/wards");
    expect(result).toEqual({ status: "ready", items: DA_NANG_WARDS });
    expect(result.status === "ready" && result.items.map((ward) => ward.name)).toEqual([
      "An Hải",
      "An Khê",
      "Bà Nà",
      "Cẩm Lệ",
      "Hải Châu",
      "Hải Vân",
      "Hòa Cường",
      "Hòa Khánh",
      "Hoàng Sa",
      "Hòa Tiến",
      "Hòa Vang",
      "Hòa Xuân",
      "Liên Chiểu",
      "Ngũ Hành Sơn",
      "Sơn Trà",
      "Thanh Khê",
    ]);
  });

  it("encodes the province code in the path", async () => {
    const { client, requests } = stub(() => json(200, []));
    await loadWards("a/b", client);
    expect(requests[0].url).toBe("http://api.test/api/v1/public/provinces/a%2Fb/wards");
  });

  it("maps 404 NOT_FOUND to empty", async () => {
    const { client } = stub(() =>
      json(404, { code: "NOT_FOUND", message: "Province was not found.", errors: [], correlationId: "c-404-0001" }),
    );
    expect(await loadWards("99", client)).toEqual({ status: "empty" });
  });

  it("maps an empty list to empty", async () => {
    const { client } = stub(() => json(200, []));
    expect(await loadWards("48", client)).toEqual({ status: "empty" });
  });

  it("maps a network failure to failed", async () => {
    const { client } = stub(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await loadWards("48", client)).toEqual({ status: "failed" });
  });

  it("a throwing client is failed", async () => {
    await expect(loadWards("48", THROWING_CLIENT)).resolves.toEqual({ status: "failed" });
  });

  it("skips null and non-object entries in a 200 list", async () => {
    const { client } = stub(() => json(200, [null, "x", { code: "1", name: "B", type: "WARD" }]));
    expect(await loadWards("48", client)).toEqual({ status: "ready", items: [{ code: "1", name: "B", type: "WARD" }] });
  });

  it("keeps the correlation id only on a 5xx", async () => {
    const fiveHundred = stub(() => json(503, { code: "INTERNAL_ERROR", errors: [] }, { "X-Correlation-Id": "head-503-01" }));
    expect(await loadWards("48", fiveHundred.client)).toEqual({ status: "failed", correlationId: "head-503-01" });
    const fourHundred = stub(() => json(400, { code: "MALFORMED_REQUEST", errors: [], correlationId: "c-400-0001" }));
    expect(await loadWards("48", fourHundred.client)).toEqual({ status: "failed" });
  });

  it("drops entries without a code, name or known type and keeps the order of the rest", async () => {
    const { client } = stub(() =>
      json(200, [
        { code: "1", name: "B", type: "WARD" },
        { code: "2", type: "WARD" },
        { code: "3", name: "C", type: "OTHER" },
        { code: "4", name: "A", type: "COMMUNE" },
      ]),
    );
    expect(await loadWards("48", client)).toEqual({
      status: "ready",
      items: [
        { code: "1", name: "B", type: "WARD" },
        { code: "4", name: "A", type: "COMMUNE" },
      ],
    });
  });
});
