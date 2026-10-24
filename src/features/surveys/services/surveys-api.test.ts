import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";

import type { paths } from "@/api/generated/schema";
import type { ApiCall } from "@/features/auth/client";
import { toPublicResult } from "@/lib/api";

import {
  bookSurvey,
  cancelAppointment,
  changeAppointment,
  checkOverlaps,
  getSurvey,
  listSurveyors,
  listSurveys,
  recordVisit,
  resumeSurvey,
  setConfirmation,
  type SurveysDeps,
} from "./surveys-api";

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

const BASIS = { confirmedOn: "2026-10-23", text: "Owner said so on the phone" };
const PLACE = { addressText: "25 Trần Phú", provinceCode: "48", wardCode: "20242", latitude: 16.07, longitude: 108.22 };

describe("listSurveys (spec 7.1)", () => {
  it("sends scope, page and size on mine, never a surveyor", async () => {
    const { sent, deps } = fakeServer(() => json({ items: [], page: 0, size: 20, totalElements: 0 }));
    const result = await listSurveys({ scope: "mine", page: 0, size: 20 }, deps);
    expect(result.ok).toBe(true);
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/survey-appointments");
    expect(Object.fromEntries(sent[0].url.searchParams)).toEqual({ scope: "mine", page: "0", size: "20" });
  });

  it("sends the surveyor with all", async () => {
    const { sent, deps } = fakeServer(() => json({ items: [] }));
    await listSurveys({ scope: "all", surveyorUserId: "U1", page: 2, size: 20 }, deps);
    expect(Object.fromEntries(sent[0].url.searchParams)).toEqual({
      scope: "all",
      surveyorUserId: "U1",
      page: "2",
      size: "20",
    });
  });
});

describe("lead survey reads", () => {
  it("getSurvey reads the block of the lead", async () => {
    const { sent, deps } = fakeServer(() => json({ leadId: "L1", appointments: [] }));
    const result = await getSurvey("L1", deps);
    expect(result.ok && result.data.leadId).toBe("L1");
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/survey");
  });

  it("checkOverlaps sends start and duration, and the appointment to leave out on edit", async () => {
    const { sent, deps } = fakeServer(() => json({ overlaps: [] }));
    await checkOverlaps("L1", { startAt: "2026-10-25T03:00:00.000Z", durationMinutes: 60 }, deps);
    await checkOverlaps(
      "L1",
      { startAt: "2026-10-25T03:00:00.000Z", durationMinutes: 90, excludeAppointmentId: "A1" },
      deps,
    );
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/survey-overlaps");
    expect(Object.fromEntries(sent[0].url.searchParams)).toEqual({
      startAt: "2026-10-25T03:00:00.000Z",
      durationMinutes: "60",
    });
    expect(Object.fromEntries(sent[1].url.searchParams)).toEqual({
      startAt: "2026-10-25T03:00:00.000Z",
      durationMinutes: "90",
      excludeAppointmentId: "A1",
    });
  });
});

describe("survey commands (spec 7.1 bodies)", () => {
  it("bookSurvey posts the book body to the lead", async () => {
    const { sent, deps } = fakeServer(() => json({ survey: {} }, 201));
    const body = {
      expectedLeadVersion: 2,
      startAt: "2026-10-25T03:00:00.000Z",
      durationMinutes: 60,
      meetingLocation: PLACE,
      ownerConfirmed: true,
      confirmationNote: "Owner agreed by phone",
    };
    const result = await bookSurvey("L1", body, deps);
    expect(result.ok).toBe(true);
    expect(sent[0]).toMatchObject({ method: "POST", body });
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/survey-appointments");
  });

  it("changeAppointment posts every key, nulls included", async () => {
    const { sent, deps } = fakeServer();
    const body = {
      expectedLeadVersion: 3,
      expectedAppointmentVersion: 0,
      reason: "Owner asked for later",
      startAt: "2026-10-25T05:00:00.000Z",
      durationMinutes: 90,
      meetingLocation: PLACE,
      accessNote: null,
      onSiteContactName: null,
      onSiteContactRole: null,
    };
    await changeAppointment("A1", body, deps);
    expect(sent[0].url.pathname).toBe("/api/v1/staff/survey-appointments/A1/changes");
    expect(sent[0].body).toEqual(body);
  });

  it("setConfirmation, cancelAppointment and recordVisit post to the appointment", async () => {
    const { sent, deps } = fakeServer();
    await setConfirmation("A1", { expectedLeadVersion: 3, expectedAppointmentVersion: 1, confirmed: true }, deps);
    await cancelAppointment(
      "A1",
      { expectedLeadVersion: 4, expectedAppointmentVersion: 2, cancelReason: "OTHER", description: "Road closed" },
      deps,
    );
    const visit = {
      expectedLeadVersion: 4,
      expectedAppointmentVersion: 1,
      arrivedAt: "2026-10-25T02:50:00.000Z",
      note: "Met the owner",
      performedByUserId: "U2",
      proxy: { reason: "Sale had no signal", basis: BASIS },
    };
    await recordVisit("A1", visit, deps);
    expect(sent.map((entry) => entry.url.pathname)).toEqual([
      "/api/v1/staff/survey-appointments/A1/confirmation",
      "/api/v1/staff/survey-appointments/A1/cancellation",
      "/api/v1/staff/survey-appointments/A1/visit",
    ]);
    expect(sent[0].body).toEqual({ expectedLeadVersion: 3, expectedAppointmentVersion: 1, confirmed: true });
    expect(sent[1].body).toEqual({
      expectedLeadVersion: 4,
      expectedAppointmentVersion: 2,
      cancelReason: "OTHER",
      description: "Road closed",
    });
    expect(sent[2].body).toEqual(visit);
  });

  it("resumeSurvey posts reason and basis to the lead", async () => {
    const { sent, deps } = fakeServer(() => json({}, 201));
    await resumeSurvey("L1", { expectedLeadVersion: 5, reason: "Owner is back", basis: BASIS }, deps);
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/L1/survey-resumptions");
    expect(sent[0].body).toEqual({ expectedLeadVersion: 5, reason: "Owner is back", basis: BASIS });
  });

  it("encodes the ids in the path", async () => {
    const { sent, deps } = fakeServer();
    await getSurvey("a/b", deps);
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-leads/a%2Fb/survey");
  });
});

describe("listSurveyors (spec 6.5: the Surveyor filter)", () => {
  it("reads the staff who can hold leads", async () => {
    const { sent, deps } = fakeServer(() => json([{ userId: "U1", fullName: "Sale One", roles: ["SALE"] }]));
    const result = await listSurveyors(deps);
    expect(result.ok && result.data).toEqual([{ userId: "U1", fullName: "Sale One", roles: ["SALE"] }]);
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url.pathname).toBe("/api/v1/staff/owner-lead-assignees");
  });
});
