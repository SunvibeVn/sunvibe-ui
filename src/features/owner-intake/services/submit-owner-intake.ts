import type { components } from "@/api/generated/schema";
import { createPublicClient, toPublicResult, type PublicApiResult } from "@/lib/api";

import type { IdempotencyKeys } from "../lib/idempotency";
import { invalidOutcome, toSubmitOutcome, type OwnerIntakeAccepted, type SubmitOutcome } from "../lib/submit-outcome";
import { toRequestBody } from "../lib/to-request-body";
import { validateOwnerIntake } from "../schemas/owner-intake-schema";
import type { FormValues, OwnerIntakeRequestBody } from "../types/form";

type PublicClient = ReturnType<typeof createPublicClient>;

/** POST /api/v1/public/owner-intake-requests with its Idempotency-Key (handoff 2.3). Never throws for HTTP errors. */
export function sendOwnerIntake(
  body: OwnerIntakeRequestBody,
  idempotencyKey: string,
  client: PublicClient = createPublicClient(),
): Promise<PublicApiResult<OwnerIntakeAccepted>> {
  return toPublicResult(
    client.POST("/api/v1/public/owner-intake-requests", {
      // The OpenAPI file types askingPrice.amount as a string (int64 format) but the server wants a JSON number
      // (handoff section 6); OwnerIntakeRequestBody overrides that one field, so cast at this call only.
      body: body as unknown as components["schemas"]["OwnerIntakeRequest"],
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  );
}

export type SubmitDependencies = {
  /** Kept by the form for its whole life, so a retry of the same body reuses its key. */
  keys: IdempotencyKeys;
  /** next-intl `t.has` on the OwnerIntake namespace. */
  has: (key: string) => boolean;
  send?: (body: OwnerIntakeRequestBody, idempotencyKey: string) => Promise<PublicApiResult<OwnerIntakeAccepted>>;
  log?: (message: string, details: unknown) => void;
};

/**
 * One submit of the form: client validation (nothing sent when it fails), the body from the controlled values,
 * the key of that body, the request, then the key update and the FE-bug log the answer calls for.
 */
export async function submitOwnerIntake(
  values: FormValues,
  { keys, has, send = (body, key) => sendOwnerIntake(body, key), log = console.error }: SubmitDependencies,
): Promise<SubmitOutcome> {
  const kinds = validateOwnerIntake(values);
  if (Object.keys(kinds).length > 0) return invalidOutcome(kinds, has);

  // Never from FormData: disabled selects drop out of it.
  const body = toRequestBody(values);
  const key = keys.keyFor(JSON.stringify(body));

  let result: PublicApiResult<OwnerIntakeAccepted>;
  try {
    result = await send(body, key);
  } catch (cause) {
    // toPublicResult never throws; this is a broken setup such as a missing NEXT_PUBLIC_API_URL.
    // Only the message or the type: a raw thrown value could carry the owner's data.
    log("owner-intake: could not send the request", cause instanceof Error ? cause.message : typeof cause);
    result = { ok: false, kind: "network" };
  }

  const outcome = toSubmitOutcome(result, has);
  if (outcome.key === "reset") keys.reset();
  else if (outcome.key === "renew") keys.renew();
  if (outcome.kind === "error" && outcome.log) log("owner-intake: request refused because of an FE bug", outcome.log);
  return outcome;
}
