import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";

import type { paths } from "@/api/generated/schema";
import type { ApiCall } from "@/features/auth/client";
import { createPublicClient, toPublicResult } from "@/lib/api";

import { toApiQuery, type ListState } from "../lib/list-url-state";

import {
  addNote,
  assignLead,
  changeIntent,
  changeStatus,
  findLeadByRequestCode,
  getLead,
  getLeadSurvey,
  listAssignees,
  listLeads,
  listWards,
  type OwnerLeadsDeps,
} from "./owner-leads-api";

type Sent = { method: string; url: URL; body: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fake `callApi`: runs the request against a real typed client whose fetch records the request. */
function fakeServer(reply: (sent: Sent) => Response | Promise<Response> = () => json({})) {
  const sent: Sent[] = [];
  const client = createClient<paths>({
    baseUrl: "http://api.test",
    fetch: async (request) => {
      const text = request.method === "GET" || request.method === "DELETE" ? "" : await request.text();
      const entry: Sent = { method: request.method, url: new URL(request.url), body: text ? JSON.parse(text) : undefined };
      sent.push(entry);
      return reply(entry);
    },
  });
  const deps: OwnerLeadsDeps = {
    callApi: async <T>(run: ApiCall<T>) => toPublicResult(run(client)),
  };
  return { sent, deps };
}

const MINE: ListState = {
  scope: "mine",
  statuses: ["ASSIGNED", "CONTACTED", "ON_HOLD", "DUPLICATE"],
  page: 1,
};

describe("listLeads", () => {
  it("maps toApiQuery to query params with a repeated status", async () => {
    const { sent, deps } = fakeServer(() => json({ items: [], page: 0, size: 20, totalElements: 0 }));
    const result = await listLeads(toApiQuery(MINE), deps);
    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads");
    expect(sent[0].url.searchParams.getAll("status")).toEqual(["ASSIGNED", "CONTACTED", "ON_HOLD", "DUPLICATE"]);
    expect(sent[0].url.searchParams.get("scope")).toBe("mine");
    expect(sent[0].url.searchParams.get("page")).toBe("0");
    expect(sent[0].url.searchParams.get("size")).toBe("20");
  });

  it("omits optional params that are not set; the status set is always sent", async () => {
    const { sent, deps } = fakeServer();
    await listLeads(toApiQuery({ scope: "all", statuses: ["NEW"], page: 2 }), deps);
    const params = sent[0].url.searchParams;
    expect(params.getAll("status")).toEqual(["NEW"]);
    expect(params.has("wardCode")).toBe(false);
    expect(params.has("assigneeUserId")).toBe(false);
    expect(params.has("requestCode")).toBe(false);
    expect(params.get("scope")).toBe("all");
    expect(params.get("page")).toBe("1");
  });

  it("sends the ward and the assignee on all", async () => {
    const { sent, deps } = fakeServer();
    await listLeads(
      toApiQuery({
        scope: "all",
        statuses: ["ASSIGNED"],
        ward: "20242",
        assignee: "01JE2EACCT0000000000000002",
        page: 1,
      }),
      deps,
    );
    expect(sent[0].url.searchParams.get("wardCode")).toBe("20242");
    expect(sent[0].url.searchParams.get("assigneeUserId")).toBe("01JE2EACCT0000000000000002");
  });
});

describe("findLeadByRequestCode", () => {
  it("sends requestCode and scope and no status", async () => {
    const { sent, deps } = fakeServer(() => json({ items: [], page: 0, size: 5, totalElements: 0 }));
    await findLeadByRequestCode("SV-E2EA-AA2A", "all", deps);
    const params = sent[0].url.searchParams;
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads");
    expect(params.get("requestCode")).toBe("SV-E2EA-AA2A");
    expect(params.get("scope")).toBe("all");
    expect(params.has("status")).toBe(false);
    expect(params.has("wardCode")).toBe(false);
    expect(params.has("assigneeUserId")).toBe(false);
  });

  it("uses the mine scope for an own-leads viewer", async () => {
    const { sent, deps } = fakeServer();
    await findLeadByRequestCode("SV-E2EA-AA2A", "mine", deps);
    expect(sent[0].url.searchParams.get("scope")).toBe("mine");
  });
});

describe("getLead", () => {
  it("dedupes in-flight detail requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sent, deps } = fakeServer(async () => {
      await gate;
      return json({ leadId: "L1" });
    });

    const first = getLead("L1", "U1", deps);
    const second = getLead("L1", "U1", deps);
    const other = getLead("L2", "U1", deps);
    await Promise.resolve();
    release();
    const [a, b] = await Promise.all([first, second, other]);
    expect(a).toBe(b);
    expect(sent.map((s) => s.url.pathname).sort()).toEqual([
      "/api/v1/staff/owner-leads/L1",
      "/api/v1/staff/owner-leads/L2",
    ]);

    await getLead("L1", "U1", deps);
    expect(sent.filter((s) => s.url.pathname.endsWith("/L1"))).toHaveLength(2);
  });

  it("keeps requests of two users for the same lead apart", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sent, deps } = fakeServer(async () => {
      await gate;
      return json({ leadId: "L1" });
    });

    const forA = getLead("L1", "UA", deps);
    const forAAgain = getLead("L1", "UA", deps);
    const forB = getLead("L1", "UB", deps);
    await Promise.resolve();
    expect(forA).toBe(forAAgain);
    expect(forB).not.toBe(forA);
    release();
    await Promise.all([forA, forAAgain, forB]);
    expect(sent).toHaveLength(2);
  });

  it("does not keep a failed result", async () => {
    let status = 500;
    const { sent, deps } = fakeServer(() => json({ code: "INTERNAL_ERROR" }, status));
    const failed = await getLead("L1", "U1", deps);
    expect(failed.ok).toBe(false);
    status = 200;
    const ok = await getLead("L1", "U1", deps);
    expect(ok.ok).toBe(true);
    expect(sent).toHaveLength(2);
  });
});

describe("writes", () => {
  it("addNote POSTs note and nextActionAt to activities", async () => {
    const { sent, deps } = fakeServer(() => json({}, 201));
    await addNote("L1", { note: "Gọi lại", nextActionAt: "2026-10-20T03:00:00Z" }, deps);
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/activities");
    expect(sent[0].body).toEqual({ note: "Gọi lại", nextActionAt: "2026-10-20T03:00:00Z" });
  });

  it("changeStatus POSTs the body to status-changes", async () => {
    const { sent, deps } = fakeServer();
    await changeStatus(
      "L1",
      { toStatus: "DUPLICATE", expectedVersion: 3, reason: "Trùng", duplicateOfLeadId: "L0" },
      deps,
    );
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/status-changes");
    expect(sent[0].body).toEqual({
      toStatus: "DUPLICATE",
      expectedVersion: 3,
      reason: "Trùng",
      duplicateOfLeadId: "L0",
    });
  });

  it("assignLead POSTs the body to assign", async () => {
    const { sent, deps } = fakeServer();
    await assignLead("L1", { assigneeUserId: "U1", expectedVersion: 2 }, deps);
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/assign");
    expect(sent[0].body).toEqual({ assigneeUserId: "U1", expectedVersion: 2 });
  });
});

describe("lookups", () => {
  it("listAssignees GETs the eligible assignees", async () => {
    const { sent, deps } = fakeServer(() => json([]));
    await listAssignees(deps);
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-lead-assignees");
  });

  it("listWards GETs the wards of province 48", async () => {
    const sent: Request[] = [];
    const client = createPublicClient({
      baseUrl: "http://api.test",
      fetch: async (request) => {
        sent.push(request);
        return json([{ code: "20242", name: "An Hải", type: "WARD" }]);
      },
    });
    const result = await listWards({ client });
    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(new URL(sent[0].url).pathname).toBe("/api/v1/public/provinces/48/wards");
    expect(sent[0].headers.has("Authorization")).toBe(false);
    expect(sent[0].credentials).toBe("omit");
  });

  it("listWards answers a network result when the request fails", async () => {
    const client = createPublicClient({
      baseUrl: "http://api.test",
      fetch: async () => {
        throw new TypeError("offline");
      },
    });
    await expect(listWards({ client })).resolves.toEqual({ ok: false, kind: "network" });
  });
});

describe("changeIntent (survey-schedule US-5, spec 7.1)", () => {
  const basis = { confirmedOn: "2026-10-23", text: "Owner said so on the phone" };

  it("posts the new intent with its price", async () => {
    const { sent, deps } = fakeServer(() => json({ id: "L12", status: "CONTACTED", version: 2 }));
    const body = {
      expectedVersion: 1,
      newIntent: "LONG_TERM_RENT" as const,
      askingPrice: { amount: "12000000", currency: "VND" as const, unit: "MONTH" as const },
      reason: "Owner wants long stays",
      basis,
    };
    const result = await changeIntent("L12", body, deps);
    expect(result.ok).toBe(true);
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L12/intent-changes");
    expect(sent[0].body).toEqual(body);
  });

  it("sends askingPrice: null explicitly for no price (the key is required)", async () => {
    const { sent, deps } = fakeServer();
    await changeIntent(
      "L12",
      { expectedVersion: 1, newIntent: "SHORT_TERM_RENT", askingPrice: null, reason: "r", basis },
      deps,
    );
    expect(sent[0].body).toHaveProperty("askingPrice", null);
  });
});

describe("getLeadSurvey (spec 6.1: loaded with the detail, one GET per open)", () => {
  it("reads the survey block and shares an in-flight read of the same user and lead", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sent, deps } = fakeServer(async () => {
      await gate;
      return json({ leadId: "L1", appointments: [] });
    });

    const first = getLeadSurvey("L1", "U1", deps);
    const second = getLeadSurvey("L1", "U1", deps);
    const forOther = getLeadSurvey("L1", "U2", deps);
    await Promise.resolve();
    expect(first).toBe(second);
    expect(forOther).not.toBe(first);
    release();
    await Promise.all([first, second, forOther]);
    expect(sent.map((s) => s.url.pathname)).toEqual([
      "/api/v1/staff/owner-leads/L1/survey",
      "/api/v1/staff/owner-leads/L1/survey",
    ]);

    await getLeadSurvey("L1", "U1", deps);
    expect(sent).toHaveLength(3);
  });
});
