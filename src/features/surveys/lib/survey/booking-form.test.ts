import { afterEach, describe, expect, it } from "vitest";

import { type BookingForm, bookingDefaults, toBookBody, validateBooking } from "./booking-form";

const LEAD_PLACE = { addressText: "25 Trần Phú", wardCode: "20242", latitude: 16.0715, longitude: 108.2239 };
/** 2026-10-23 09:00 in Vietnam. */
const NOW = Date.parse("2026-10-23T02:00:00Z");

const form = (extra: Partial<BookingForm> = {}): BookingForm => ({
  ...bookingDefaults(LEAD_PLACE),
  start: "2026-10-25T10:00",
  ...extra,
});

const savedTz = process.env.TZ;
afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe("bookingDefaults (spec 6.2)", () => {
  it("starts from the lead's place, 60 minutes, not confirmed, nothing typed", () => {
    expect(bookingDefaults(LEAD_PLACE)).toEqual({
      start: "",
      duration: "60",
      place: LEAD_PLACE,
      locationReason: "",
      accessNote: "",
      onSiteContactName: "",
      onSiteContactRole: "",
      ownerConfirmed: false,
      confirmationNote: "",
      resurveyReason: "",
    });
  });
});

describe("toBookBody (spec 7.1, A-22, A-24)", () => {
  it("bookingStart_isVietnamWallTime_inAnyBrowserZone (Review Focus 3)", () => {
    process.env.TZ = "America/New_York";
    const body = toBookBody(form({ start: "2026-10-25T10:00" }), { kind: "FIRST", leadPlace: LEAD_PLACE, leadVersion: 2 });
    expect(body.startAt).toBe("2026-10-25T03:00:00.000Z");
  });

  it("leaves the meeting place out when it is the lead's own place", () => {
    const body = toBookBody(form(), { kind: "FIRST", leadPlace: LEAD_PLACE, leadVersion: 2 });
    expect(body).toEqual({ expectedLeadVersion: 2, startAt: "2026-10-25T03:00:00.000Z", durationMinutes: 60, ownerConfirmed: false });
  });

  it("sends another place with its reason, the province of the pilot and the pin", () => {
    const place = { addressText: " 27 Trần Phú ", wardCode: "20257", latitude: 16.05, longitude: 108.2 };
    const body = toBookBody(form({ place, locationReason: " Owner meets at the café " }), {
      kind: "FIRST",
      leadPlace: LEAD_PLACE,
      leadVersion: 2,
    });
    expect(body.meetingLocation).toEqual({
      addressText: "27 Trần Phú",
      provinceCode: "48",
      wardCode: "20257",
      latitude: 16.05,
      longitude: 108.2,
    });
    expect(body.locationReason).toBe("Owner meets at the café");
  });

  it("sends a place without a pin without coordinates", () => {
    const place = { ...LEAD_PLACE, latitude: null, longitude: null };
    const body = toBookBody(form({ place, locationReason: "No pin" }), { kind: "FIRST", leadPlace: LEAD_PLACE, leadVersion: 2 });
    expect(body.meetingLocation).toEqual({ addressText: "25 Trần Phú", provinceCode: "48", wardCode: "20242" });
  });

  it("trims optional texts and leaves blank ones out", () => {
    const body = toBookBody(
      form({ accessNote: "  Gate on the left ", onSiteContactName: "  ", onSiteContactRole: " Neighbour " }),
      { kind: "FIRST", leadPlace: LEAD_PLACE, leadVersion: 2 },
    );
    expect(body.accessNote).toBe("Gate on the left");
    expect(body).not.toHaveProperty("onSiteContactName");
    expect(body.onSiteContactRole).toBe("Neighbour");
  });

  it("sends the confirmation note only with Owner confirmed", () => {
    const ctx = { kind: "FIRST" as const, leadPlace: LEAD_PLACE, leadVersion: 2 };
    expect(toBookBody(form({ confirmationNote: "Agreed by phone" }), ctx)).not.toHaveProperty("confirmationNote");
    const confirmed = toBookBody(form({ ownerConfirmed: true, confirmationNote: "Agreed by phone" }), ctx);
    expect(confirmed).toMatchObject({ ownerConfirmed: true, confirmationNote: "Agreed by phone" });
  });

  it("sends the re-survey reason only for a re-survey", () => {
    const typed = form({ resurveyReason: "Owner renovated" });
    expect(toBookBody(typed, { kind: "FIRST", leadPlace: LEAD_PLACE, leadVersion: 2 })).not.toHaveProperty(
      "resurveyReason",
    );
    expect(toBookBody(typed, { kind: "RESURVEY", leadPlace: LEAD_PLACE, leadVersion: 2 }).resurveyReason).toBe(
      "Owner renovated",
    );
  });
});

describe("validateBooking (BR-4, A-14, A-25)", () => {
  const ctx = { kind: "FIRST" as const, leadPlace: LEAD_PLACE, now: NOW };

  it("accepts a complete form", () => {
    expect(validateBooking(form(), ctx)).toEqual({});
  });

  it("asks for a real start in the window: current minute to 90 days ahead", () => {
    expect(validateBooking(form({ start: "" }), ctx).start).toBe("required");
    expect(validateBooking(form({ start: "2026-02-30T10:00" }), ctx).start).toBe("invalid");
    expect(validateBooking(form({ start: "2026-10-25T10:00:30" }), ctx).start).toBe("invalid");
    expect(validateBooking(form({ start: "2026-10-23T08:59" }), ctx).start).toBe("tooEarly");
    expect(validateBooking(form({ start: "2026-10-23T09:00" }), ctx).start).toBeUndefined();
    expect(validateBooking(form({ start: "2027-01-21T09:00" }), ctx).start).toBeUndefined();
    expect(validateBooking(form({ start: "2027-01-21T09:01" }), ctx).start).toBe("tooLate");
  });

  it("takes a duration of 15..480 in steps of 15", () => {
    for (const duration of ["15", "60", "480"]) expect(validateBooking(form({ duration }), ctx).duration).toBeUndefined();
    for (const duration of ["", "0", "20", "495", "abc"]) expect(validateBooking(form({ duration }), ctx).duration).toBe("invalid");
  });

  it("checks the meeting place", () => {
    const place = (extra: Partial<BookingForm["place"]>) => form({ place: { ...LEAD_PLACE, ...extra }, locationReason: "x" });
    expect(validateBooking(place({ addressText: "  " }), ctx).address).toBe("required");
    expect(validateBooking(place({ addressText: "a".repeat(256) }), ctx).address).toBe("tooLong");
    expect(validateBooking(place({ addressText: "Call 0905 123 456" }), ctx).address).toBe("phone");
    expect(validateBooking(place({ wardCode: "" }), ctx).ward).toBe("required");
  });

  it("asks for a reason when the place differs from the lead (A-16)", () => {
    const moved = form({ place: { ...LEAD_PLACE, addressText: "27 Trần Phú" } });
    expect(validateBooking(moved, ctx).locationReason).toBe("required");
    expect(validateBooking({ ...moved, locationReason: "Café nearby" }, ctx).locationReason).toBeUndefined();
    expect(validateBooking(form({ locationReason: "" }), ctx).locationReason).toBeUndefined();
  });

  it("checks the lengths and refuses phone numbers in every free text", () => {
    expect(validateBooking(form({ accessNote: "a".repeat(1001) }), ctx).accessNote).toBe("tooLong");
    expect(validateBooking(form({ accessNote: "a".repeat(1000) }), ctx).accessNote).toBeUndefined();
    expect(validateBooking(form({ accessNote: "Key with 0905.123.456" }), ctx).accessNote).toBe("phone");
    expect(validateBooking(form({ onSiteContactName: "a".repeat(101) }), ctx).onSiteContactName).toBe("tooLong");
    expect(validateBooking(form({ onSiteContactName: "Lan 0905123456" }), ctx).onSiteContactName).toBe("phone");
    expect(validateBooking(form({ onSiteContactRole: "+84 905 123 456" }), ctx).onSiteContactRole).toBe("phone");
    const confirmed = { ownerConfirmed: true };
    expect(validateBooking(form({ ...confirmed, confirmationNote: "a".repeat(501) }), ctx).confirmationNote).toBe("tooLong");
    expect(validateBooking(form({ ...confirmed, confirmationNote: "0905 123 456" }), ctx).confirmationNote).toBe("phone");
  });

  it("asks for the re-survey reason on a re-survey only", () => {
    expect(validateBooking(form(), { ...ctx, kind: "RESURVEY" }).resurveyReason).toBe("required");
    expect(validateBooking(form({ resurveyReason: "Owner renovated" }), { ...ctx, kind: "RESURVEY" })).toEqual({});
    expect(validateBooking(form(), ctx).resurveyReason).toBeUndefined();
  });
});
