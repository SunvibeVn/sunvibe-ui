import { describe, expect, it, vi as vitest } from "vitest";

import vi from "@/i18n/messages/vi.json";
import { createPublicClient, type PublicApiResult } from "@/lib/api";

import { createIdempotencyKeys } from "../lib/idempotency";
import { EMPTY_FORM_VALUES } from "../lib/form-values";
import type { OwnerIntakeAccepted } from "../lib/submit-outcome";
import { toRequestBody } from "../lib/to-request-body";
import type { FormValues, OwnerIntakeRequestBody } from "../types/form";

import { sendOwnerIntake, submitOwnerIntake } from "./submit-owner-intake";

/** Same lookup as next-intl `t.has` on the OwnerIntake namespace. */
function has(key: string) {
  let node: unknown = vi.OwnerIntake;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

const VALID: FormValues = {
  ...EMPTY_FORM_VALUES,
  contactName: "Nguyễn Văn Thử",
  phone: "0909 123 456",
  intent: "LONG_TERM_RENT",
  provinceCode: "48",
  wardCode: "20242",
  wardType: "WARD",
  wardName: "An Hải",
  addressDetail: "12 Đường Mẫu, căn A-1203",
  askingPrice: { amount: "15000000" },
  consent: { accepted: true },
};

const CORRELATION_ID = "01JB7Q0Z3E6K9M2N4P5R8S1T0V";
const ACCEPTED: PublicApiResult<OwnerIntakeAccepted> = {
  ok: true,
  status: 202,
  data: { requestCode: "SV-7K3M-Q9TX" },
  replayed: false,
};
const SERVER_ERROR: PublicApiResult<OwnerIntakeAccepted> = {
  ok: false,
  kind: "http",
  status: 500,
  code: "INTERNAL_ERROR",
  fieldErrors: [],
  correlationId: CORRELATION_ID,
};

/** A fake server answering from a list; records every body and key sent. */
function fakeSend(...answers: PublicApiResult<OwnerIntakeAccepted>[]) {
  const calls: { body: OwnerIntakeRequestBody; key: string }[] = [];
  const send = async (body: OwnerIntakeRequestBody, key: string) => {
    calls.push({ body, key });
    return answers[Math.min(calls.length - 1, answers.length - 1)];
  };
  return { send, calls };
}

function counterKeys() {
  let n = 0;
  return createIdempotencyKeys(() => `key-0000-${++n}`);
}

describe("sendOwnerIntake", () => {
  it("POSTs the JSON body with the Idempotency-Key header and the price amount as a number", async () => {
    const requests: Request[] = [];
    const client = createPublicClient({
      baseUrl: "http://api.test",
      fetch: async (request) => {
        requests.push(request);
        return new Response(JSON.stringify({ requestCode: "SV-7K3M-Q9TX" }), {
          status: 202,
          headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
        });
      },
    });

    const result = await sendOwnerIntake(toRequestBody(VALID), "0b6c1c9e-5a8f-4c43-9d36-8f1f7c1e2a10", client);

    expect(result).toMatchObject({ ok: true, data: { requestCode: "SV-7K3M-Q9TX" }, replayed: true });
    const [request] = requests;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://api.test/api/v1/public/owner-intake-requests");
    expect(request.credentials).toBe("omit");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.headers.get("Idempotency-Key")).toBe("0b6c1c9e-5a8f-4c43-9d36-8f1f7c1e2a10");
    const body = await request.json();
    expect(body.askingPrice).toEqual({ amount: 15000000, currency: "VND", unit: "MONTH" });
    expect(body.consent).toEqual({ accepted: true, noticeVersion: "owner-intake-2026-10-21" });
  });
});

describe("submitOwnerIntake", () => {
  it("sends nothing when client validation fails and returns the per-field messages", async () => {
    const { send, calls } = fakeSend(ACCEPTED);
    const outcome = await submitOwnerIntake({ ...VALID, phone: "0123", consent: { accepted: false } }, {
      keys: counterKeys(),
      has,
      send,
    });
    expect(calls).toHaveLength(0);
    expect(outcome).toEqual({
      kind: "error",
      fieldErrors: {
        phone: { key: "errors.fields.phone.invalid" },
        "consent.accepted": { key: "errors.fields.consent.accepted.invalid" },
      },
      retryable: false,
      key: "keep",
    });
  });

  it("sends the body built from the form values with a key", async () => {
    const { send, calls } = fakeSend(ACCEPTED);
    const outcome = await submitOwnerIntake(VALID, { keys: counterKeys(), has, send });
    expect(calls).toEqual([{ body: toRequestBody(VALID), key: "key-0000-1" }]);
    expect(outcome).toEqual({ kind: "success", requestCode: "SV-7K3M-Q9TX", key: "reset" });
  });

  it("retries the same body with the same key after a 500 or a network error", async () => {
    const { send, calls } = fakeSend(SERVER_ERROR, { ok: false, kind: "network" }, ACCEPTED);
    const keys = counterKeys();
    await submitOwnerIntake(VALID, { keys, has, send });
    await submitOwnerIntake(VALID, { keys, has, send });
    await submitOwnerIntake(VALID, { keys, has, send });
    expect(calls.map((call) => call.key)).toEqual(["key-0000-1", "key-0000-1", "key-0000-1"]);
    expect(calls[2].body).toEqual(calls[0].body);
  });

  it("uses a new key once a field changed", async () => {
    const { send, calls } = fakeSend(SERVER_ERROR);
    const keys = counterKeys();
    await submitOwnerIntake(VALID, { keys, has, send });
    await submitOwnerIntake({ ...VALID, notes: "Có nội thất" }, { keys, has, send });
    expect(calls.map((call) => call.key)).toEqual(["key-0000-1", "key-0000-2"]);
  });

  it("forgets the key after a success, so the next request gets a new one", async () => {
    const { send, calls } = fakeSend(ACCEPTED);
    const keys = counterKeys();
    await submitOwnerIntake(VALID, { keys, has, send });
    await submitOwnerIntake(VALID, { keys, has, send });
    expect(calls.map((call) => call.key)).toEqual(["key-0000-1", "key-0000-2"]);
  });

  it("renews the key after a 409, so sending the same body again uses a new key", async () => {
    const { send, calls } = fakeSend(
      { ok: false, kind: "http", status: 409, code: "IDEMPOTENCY_KEY_REUSED", fieldErrors: [], correlationId: CORRELATION_ID },
      ACCEPTED,
    );
    const keys = counterKeys();
    const first = await submitOwnerIntake(VALID, { keys, has, send });
    await submitOwnerIntake(VALID, { keys, has, send });
    expect(first).toMatchObject({ message: "errors.keyReused", retryable: true });
    expect(calls.map((call) => call.key)).toEqual(["key-0000-1", "key-0000-2"]);
  });

  it("logs an FE-bug answer with its correlation id", async () => {
    const { send } = fakeSend({
      ok: false,
      kind: "http",
      status: 400,
      code: "VALIDATION_FAILED",
      fieldErrors: [{ field: "consent.noticeVersion", message: "Unknown notice version." }],
      correlationId: CORRELATION_ID,
    });
    const log = vitest.fn();
    const outcome = await submitOwnerIntake(VALID, { keys: counterKeys(), has, send, log });
    expect(outcome).toMatchObject({ message: "errors.generic" });
    expect(log).toHaveBeenCalledWith("owner-intake: request refused because of an FE bug", {
      status: 400,
      code: "VALIDATION_FAILED",
      correlationId: CORRELATION_ID,
      fields: ["consent.noticeVersion"],
    });
  });

  it("does not log an answer the owner can act on", async () => {
    const { send } = fakeSend(SERVER_ERROR);
    const log = vitest.fn();
    await submitOwnerIntake(VALID, { keys: counterKeys(), has, send, log });
    expect(log).not.toHaveBeenCalled();
  });

  it("turns a throwing sender (e.g. a missing API URL) into a retryable network error, logged", async () => {
    const log = vitest.fn();
    const outcome = await submitOwnerIntake(VALID, {
      keys: counterKeys(),
      has,
      send: () => {
        throw new Error("Missing environment variable: NEXT_PUBLIC_API_URL");
      },
      log,
    });
    expect(outcome).toMatchObject({ kind: "error", message: "errors.network", retryable: true });
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "owner-intake: could not send the request",
      "Missing environment variable: NEXT_PUBLIC_API_URL",
    );
  });

  it("logs only the type of a thrown non-Error, never the raw value (it may hold form data)", async () => {
    const log = vitest.fn();
    await submitOwnerIntake(VALID, {
      keys: counterKeys(),
      has,
      send: () => {
        throw { phone: "0905123456" };
      },
      log,
    });
    expect(log).toHaveBeenCalledWith("owner-intake: could not send the request", "object");
  });
});
