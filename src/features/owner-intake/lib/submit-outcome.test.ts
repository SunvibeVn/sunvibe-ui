import { describe, expect, it } from "vitest";

import vi from "@/i18n/messages/vi.json";
import type { FieldError, PublicApiResult } from "@/lib/api";

import { invalidOutcome, toSubmitOutcome, type OwnerIntakeAccepted } from "./submit-outcome";

/** Same lookup as next-intl `t.has` on the OwnerIntake namespace. */
function has(key: string) {
  let node: unknown = vi.OwnerIntake;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

const CORRELATION_ID = "01JB7Q0Z3E6K9M2N4P5R8S1T0V";

function accepted(requestCode: string | undefined, replayed = false): PublicApiResult<OwnerIntakeAccepted> {
  return {
    ok: true,
    status: 202,
    data: requestCode === undefined ? {} : { requestCode },
    replayed,
    correlationId: CORRELATION_ID,
  };
}

function httpError(
  status: number,
  code: string | undefined,
  fieldErrors: FieldError[] = [],
  extra: { correlationId?: string; retryAfterSeconds?: number } = { correlationId: CORRELATION_ID },
): PublicApiResult<OwnerIntakeAccepted> {
  return { ok: false, kind: "http", status, code, fieldErrors, ...extra };
}

function validation(...fields: string[]) {
  return httpError(
    400,
    "VALIDATION_FAILED",
    fields.map((field) => ({ field, message: "English text that is never shown." })),
  );
}

describe("toSubmitOutcome: success (202) and replay", () => {
  it("shows the request code and forgets the key", () => {
    expect(toSubmitOutcome(accepted("SV-7K3M-Q9TX"), has)).toEqual({
      kind: "success",
      requestCode: "SV-7K3M-Q9TX",
      key: "reset",
    });
  });

  it("shows a replay (Idempotent-Replayed: true) exactly like a new request", () => {
    expect(toSubmitOutcome(accepted("SV-7K3M-Q9TX", true), has)).toEqual(
      toSubmitOutcome(accepted("SV-7K3M-Q9TX", false), has),
    );
  });

  it("treats a 202 without a request code as a generic error and logs it", () => {
    expect(toSubmitOutcome(accepted(undefined), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: false,
      key: "keep",
      log: { status: 202, correlationId: CORRELATION_ID },
    });
  });
});

describe("toSubmitOutcome: 400 VALIDATION_FAILED", () => {
  it("puts each field error on its input, with no banner, and keeps the key", () => {
    expect(toSubmitOutcome(validation("addressDetail", "phone"), has)).toEqual({
      kind: "error",
      fieldErrors: {
        addressDetail: { key: "errors.fields.addressDetail.invalid" },
        phone: { key: "errors.fields.phone.invalid" },
      },
      retryable: false,
      key: "keep",
    });
  });

  it("maps the nested askingPrice fields onto the amount input with their own message", () => {
    expect(toSubmitOutcome(validation("askingPrice.amount"), has)).toMatchObject({
      fieldErrors: { "askingPrice.amount": { key: "errors.fields.askingPrice.amount.invalid" } },
    });
    expect(toSubmitOutcome(validation("askingPrice.currency"), has)).toMatchObject({
      fieldErrors: { "askingPrice.amount": { key: "errors.fields.askingPrice.currency.invalid" } },
    });
    expect(toSubmitOutcome(validation("askingPrice.unit"), has)).toMatchObject({
      fieldErrors: { "askingPrice.amount": { key: "errors.fields.askingPrice.unit.invalid" } },
    });
    expect(toSubmitOutcome(validation("askingPrice"), has)).toMatchObject({
      fieldErrors: { "askingPrice.amount": { key: "errors.fields.askingPrice.invalid" } },
    });
  });

  it("keeps the first message when several server fields land on the same input", () => {
    expect(toSubmitOutcome(validation("askingPrice.amount", "askingPrice.unit"), has)).toMatchObject({
      fieldErrors: { "askingPrice.amount": { key: "errors.fields.askingPrice.amount.invalid" } },
    });
  });

  it("puts consent and consent.accepted on the checkbox", () => {
    expect(toSubmitOutcome(validation("consent.accepted"), has)).toMatchObject({
      fieldErrors: { "consent.accepted": { key: "errors.fields.consent.accepted.invalid" } },
    });
    expect(toSubmitOutcome(validation("consent"), has)).toMatchObject({
      fieldErrors: { "consent.accepted": { key: "errors.fields.consent.invalid" } },
    });
  });

  it("puts latitude and longitude errors on the map area", () => {
    expect(toSubmitOutcome(validation("latitude", "longitude"), has)).toMatchObject({
      fieldErrors: {
        latitude: { key: "errors.fields.latitude.invalid" },
        longitude: { key: "errors.fields.longitude.invalid" },
      },
    });
  });

  it("falls back to the generic message on the input when the field has no message of its own", () => {
    const hasNothing = () => false;
    expect(toSubmitOutcome(validation("phone"), hasNothing)).toMatchObject({
      fieldErrors: { phone: { key: "errors.generic" } },
    });
  });

  it.each(["Idempotency-Key", "consent.noticeVersion"])("treats an error on %s as an FE bug: generic error, logged", (field) => {
    expect(toSubmitOutcome(validation(field), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: false,
      key: "keep",
      log: { status: 400, code: "VALIDATION_FAILED", correlationId: CORRELATION_ID, fields: [field] },
    });
  });

  it("shows the owner's field errors and the generic error when an FE-bug field comes with them", () => {
    expect(toSubmitOutcome(validation("consent.noticeVersion", "phone"), has)).toEqual({
      kind: "error",
      fieldErrors: { phone: { key: "errors.fields.phone.invalid" } },
      message: "errors.generic",
      retryable: false,
      key: "keep",
      log: { status: 400, code: "VALIDATION_FAILED", correlationId: CORRELATION_ID, fields: ["consent.noticeVersion"] },
    });
  });

  it("treats an unknown field as an FE bug", () => {
    expect(toSubmitOutcome(validation("somethingNew"), has)).toMatchObject({
      fieldErrors: {},
      message: "errors.generic",
      log: { fields: ["somethingNew"] },
    });
  });

  it("treats VALIDATION_FAILED without field errors as an FE bug", () => {
    expect(toSubmitOutcome(validation(), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: false,
      key: "keep",
      log: { status: 400, code: "VALIDATION_FAILED", correlationId: CORRELATION_ID, fields: [] },
    });
  });
});

describe("toSubmitOutcome: other errors of handoff section 4", () => {
  it.each([
    [400, "MALFORMED_REQUEST"],
    [415, "MALFORMED_REQUEST"],
    [413, "PAYLOAD_TOO_LARGE"],
  ])("%i %s: generic error, logged with the correlation id (FE bug)", (status, code) => {
    expect(toSubmitOutcome(httpError(status, code), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: false,
      key: "keep",
      log: { status, code, correlationId: CORRELATION_ID },
    });
  });

  it("409 IDEMPOTENCY_KEY_REUSED: renews the key and asks the owner to send again", () => {
    expect(toSubmitOutcome(httpError(409, "IDEMPOTENCY_KEY_REUSED"), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.keyReused",
      retryable: true,
      key: "renew",
    });
  });

  it("429 RATE_LIMITED: E-5 text and the Retry-After wait", () => {
    expect(
      toSubmitOutcome(httpError(429, "RATE_LIMITED", [], { correlationId: CORRELATION_ID, retryAfterSeconds: 120 }), has),
    ).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.rateLimited",
      retryable: false,
      key: "keep",
      retryAfterSeconds: 120,
    });
  });

  it.each([undefined, 0, -5])("429 with Retry-After %s: no wait", (retryAfterSeconds) => {
    expect(toSubmitOutcome(httpError(429, "RATE_LIMITED", [], { retryAfterSeconds }), has)).toMatchObject({
      message: "errors.rateLimited",
      retryAfterSeconds: 0,
    });
  });

  it("429 with a fractional Retry-After waits the whole seconds up", () => {
    expect(toSubmitOutcome(httpError(429, "RATE_LIMITED", [], { retryAfterSeconds: 2.5 }), has)).toMatchObject({
      retryAfterSeconds: 3,
    });
  });

  it.each([500, 502, 503, 504])("%i: retryable generic error with the support code; same key for the retry", (status) => {
    expect(toSubmitOutcome(httpError(status, status === 500 ? "INTERNAL_ERROR" : undefined), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: true,
      key: "keep",
      supportCode: CORRELATION_ID,
    });
  });

  it("500 without a correlation id: no support code", () => {
    expect(toSubmitOutcome(httpError(500, "INTERNAL_ERROR", [], {}), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: true,
      key: "keep",
    });
  });

  it("network error or timeout: retryable network message; same key for the retry", () => {
    expect(toSubmitOutcome({ ok: false, kind: "network" }, has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.network",
      retryable: true,
      key: "keep",
    });
  });

  it("any other status: generic error, logged", () => {
    expect(toSubmitOutcome(httpError(404, undefined), has)).toEqual({
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: false,
      key: "keep",
      log: { status: 404, correlationId: CORRELATION_ID },
    });
  });
});

describe("invalidOutcome (client validation)", () => {
  it("shows per-field messages, no banner, and sends nothing", () => {
    expect(invalidOutcome({ phone: "required", contactName: "tooLong" }, has)).toEqual({
      kind: "error",
      fieldErrors: {
        contactName: { key: "errors.fields.contactName.tooLong", values: { max: 100 } },
        phone: { key: "errors.fields.phone.required" },
      },
      retryable: false,
      key: "keep",
    });
  });
});
