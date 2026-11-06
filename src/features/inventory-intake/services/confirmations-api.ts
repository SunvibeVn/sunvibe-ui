import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type { OwnerConfirmationDetails, OwnerConfirmationList, OwnerConfirmInput } from "../types";

// The owner's side (property-create intake 7.3). Kept apart from the staff services, so the account page loads none of
// them. The code, the phrase and the password travel in the body of a POST only.

type ConfirmationDeps = { callApi: CallApi };

const DEFAULT_DEPS: ConfirmationDeps = { callApi };

export type ConfirmationUiErrorKind =
  | "signed-out"
  | "unavailable"
  | "invalid"
  | "wrong-password"
  | "locked"
  | "rate-limited"
  | "stale"
  | "gone"
  | "retry";

export type ConfirmationUiError = { kind: ConfirmationUiErrorKind; correlationId?: string };

const PASSWORD_FIELD = "currentPassword";

const withCorrelation = (kind: ConfirmationUiErrorKind, correlationId: string | undefined): ConfirmationUiError =>
  correlationId === undefined ? { kind } : { kind, correlationId };

/**
 * Maps an owner call to its UI case by `code`; null for a success. A bad code, an ended request and a voided one are one
 * answer, so the page cannot tell them apart. Any other 409 reads the list again, as CONCURRENT_MODIFICATION does.
 */
export function toConfirmationUiError(result: ApiResult<unknown>): ConfirmationUiError | null {
  if (result.ok) return null;
  switch (result.kind) {
    case "signed-out":
      return { kind: "signed-out" };
    case "unavailable":
      return { kind: "unavailable" };
    case "network":
      return { kind: "retry" };
    case "http":
      break;
  }
  const { status, fieldErrors, correlationId } = result;
  switch (status) {
    case 400:
      return withCorrelation(fieldErrors.some(({ field }) => field === PASSWORD_FIELD) ? "wrong-password" : "invalid", correlationId);
    case 404:
      return withCorrelation("gone", correlationId);
    case 409:
      return withCorrelation("stale", correlationId);
    case 423:
      return withCorrelation("locked", correlationId);
    case 429:
      return withCorrelation("rate-limited", correlationId);
    default:
      return withCorrelation("retry", correlationId);
  }
}

/** GET the requests of this account; PENDING items hold their id, status and end date alone. */
export function listConfirmations(deps: ConfirmationDeps = DEFAULT_DEPS): Promise<ApiResult<OwnerConfirmationList>> {
  return deps.callApi((client) => client.GET("/api/v1/me/property-confirmations"));
}

export function readConfirmationDetails(
  requestId: string,
  input: { code: string },
  deps: ConfirmationDeps = DEFAULT_DEPS,
): Promise<ApiResult<OwnerConfirmationDetails>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/me/property-confirmations/{id}/details", { params: { path: { id: requestId } }, body: input }),
  );
}

export function confirmOwner(
  requestId: string,
  input: OwnerConfirmInput,
  deps: ConfirmationDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/me/property-confirmations/{id}/confirm", { params: { path: { id: requestId } }, body: input }),
  );
}

export function declineConfirmation(
  requestId: string,
  input: { code: string },
  deps: ConfirmationDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/me/property-confirmations/{id}/decline", { params: { path: { id: requestId } }, body: input }),
  );
}

export function enterCheckPhrase(
  requestId: string,
  input: { phrase: string },
  deps: ConfirmationDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/me/property-confirmations/{id}/check", { params: { path: { id: requestId } }, body: input }),
  );
}

export function withdrawConfirmation(
  requestId: string,
  input: { currentPassword: string },
  deps: ConfirmationDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/me/property-confirmations/{id}/withdrawal", { params: { path: { id: requestId } }, body: input }),
  );
}
