import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";

import type { paths } from "@/api/generated/schema";
import type { ApiCall } from "@/features/auth/client";
import { toPublicResult } from "@/lib/api";

import { CHECKLIST_GROUP_PATHS } from "../types";

import {
  getCheckpoint,
  getChecklist,
  saveChecklistGroup,
  startChecklist,
  takeOverChecklist,
} from "./checklists-api";
import type { SurveysDeps } from "./surveys-api";

type Sent = { method: string; url: URL; body: unknown };

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

const BASIS = { confirmedOn: "2026-10-24", text: "Handover note of the visit" };

describe("startChecklist (spec 7.1)", () => {
  it("posts the intake declaration, or null for the performer", async () => {
    const { sent, deps } = fakeServer(() => json({ checklist: { id: "C1" } }, 201));
    const result = await startChecklist("A1", { intake: null }, deps);
    expect(result.ok && result.status).toBe(201);
    await startChecklist("A1", { intake: { reason: "Took the lead over", basis: BASIS } }, deps);
    expect(sent.map((entry) => [entry.method, entry.url.pathname, entry.body])).toEqual([
      ["POST", "/api/v1/staff/survey-appointments/A1/checklists", { intake: null }],
      ["POST", "/api/v1/staff/survey-appointments/A1/checklists", { intake: { reason: "Took the lead over", basis: BASIS } }],
    ]);
  });
});

describe("getChecklist and getCheckpoint", () => {
  it("reads the checklist by id", async () => {
    const { sent, deps } = fakeServer(() => json({ id: "C1", leadId: "L1" }));
    const result = await getChecklist("C1", deps);
    expect(result.ok && result.data.leadId).toBe("L1");
    expect([sent[0].method, sent[0].url.pathname]).toEqual(["GET", "/api/v1/staff/survey-checklists/C1"]);
  });

  it("reads a takeover's checkpoint by number", async () => {
    const { sent, deps } = fakeServer(() => json({ takeover: { takeoverNo: 2 }, snapshot: { groups: {} } }));
    await getCheckpoint("C1", 2, deps);
    expect([sent[0].method, sent[0].url.pathname]).toEqual(["GET", "/api/v1/staff/survey-checklists/C1/takeovers/2"]);
  });
});

describe("takeOverChecklist", () => {
  it("posts the checklist version, reason and basis", async () => {
    const { sent, deps } = fakeServer(() => json({ checklist: { id: "C1" } }, 201));
    await takeOverChecklist("C1", { expectedVersion: 3, reason: "Now the assignee", basis: BASIS }, deps);
    expect([sent[0].method, sent[0].url.pathname, sent[0].body]).toEqual([
      "POST",
      "/api/v1/staff/survey-checklists/C1/takeovers",
      { expectedVersion: 3, reason: "Now the assignee", basis: BASIS },
    ]);
  });
});

describe("saveChecklistGroup (A-4: the body is sent as built)", () => {
  it("puts each group to its own path", async () => {
    const { sent, deps } = fakeServer(() => json({ id: "C1" }));
    for (const group of CHECKLIST_GROUP_PATHS) {
      await saveChecklistGroup("C1", group, { expectedVersion: 0, correction: null, content: null } as never, deps);
    }
    expect(sent.map((entry) => `${entry.method} ${entry.url.pathname}`)).toEqual([
      "PUT /api/v1/staff/survey-checklists/C1/identification",
      "PUT /api/v1/staff/survey-checklists/C1/parts",
      "PUT /api/v1/staff/survey-checklists/C1/dimensions",
      "PUT /api/v1/staff/survey-checklists/C1/condition",
      "PUT /api/v1/staff/survey-checklists/C1/safety",
      "PUT /api/v1/staff/survey-checklists/C1/amenities",
      "PUT /api/v1/staff/survey-checklists/C1/terms",
    ]);
  });

  it("sends the identification body with otherGroupVersions and the correction untouched", async () => {
    const { sent, deps } = fakeServer(() => json({ id: "C1" }));
    const body = {
      expectedVersion: 2,
      otherGroupVersions: { dimensions: 1, terms: 4 },
      correction: { reason: "Space was merged", basis: BASIS },
      content: {
        observedAddress: {
          state: "UNKNOWN" as const,
          value: null,
          naReason: null,
          source: null,
          confirmedOn: null,
          receivedByUserId: null,
          relayBasis: null,
        },
        differenceNote: null,
        propertyType: { state: "UNKNOWN" as const, value: null, naReason: null },
        fit: { state: "UNKNOWN" as const, value: null, naReason: null },
        rentalScope: "WHOLE" as const,
        spaces: [{ spaceId: "01JE2SPACE0000000000000001", code: "A1", location: "Ground floor", description: null }],
        otherPartsNote: null,
        generalNote: null,
      },
    };
    await saveChecklistGroup("C1", "identification", body, deps);
    expect(sent[0].body).toEqual(body);
  });

  it("returns the http failure with its code and fields", async () => {
    const { deps } = fakeServer(() =>
      json({ code: "VALIDATION_FAILED", message: "x", errors: [{ field: "correction", message: "needed" }] }, 400),
    );
    const result = await saveChecklistGroup("C1", "terms", { expectedVersion: 1, correction: null, content: null }, deps);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind === "http" && result.fieldErrors).toEqual([{ field: "correction", message: "needed" }]);
  });
});
