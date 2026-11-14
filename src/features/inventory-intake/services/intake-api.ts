import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type {
  GateReason,
  IntakeAvailabilityInput,
  IntakeBlock,
  IntakeCompletionInput,
  IntakeCompletionResult,
  IntakePreview,
  IntakeReleaseInput,
  IntakeRestorationInput,
  IntakeSuspensionInput,
  IntakeTargetInput,
  InventorySearchPage,
  InventorySearchQuery,
  OwnerCheckContext,
  OwnerCheckInput,
  OwnerCheckStarted,
  OwnerRequestInput,
  OwnerRequestIssued,
  SelectionInput,
} from "../types";

/** Signed-in calls go through `callApi` (Bearer from memory); tests pass a fake. */
export type IntakeDeps = { callApi: CallApi };

const DEFAULT_DEPS: IntakeDeps = { callApi };

/** What a failed intake or case call means for the workspace UI. */
export type IntakeUiErrorKind =
  | "signed-out"
  | "unavailable"
  | "forbidden"
  | "not-found"
  | "not-assignee"
  | "check-not-allowed"
  | "case-not-allowed"
  | "validation"
  | "selection-invalid"
  | "link-invalid"
  | "stale"
  | "state"
  | "gate"
  | "proof-required"
  | "canonical"
  | "create-not-allowed"
  | "disputed"
  | "source-invalid"
  | "availability"
  | "preview-stale"
  | "duplicate-check"
  | "already-completed"
  | "request-limit"
  | "rate-limited"
  | "retry";

export type IntakeUiError = {
  kind: IntakeUiErrorKind;
  /** `gate` only: the reasons the answer named, those this UI knows. */
  gateReasons?: GateReason[];
  /** `validation` only: the refused fields; their messages are never shown. */
  fields?: string[];
  /** Shown in small text under every message when present (ADR-010). */
  correlationId?: string;
};

const BY_CODE: Readonly<Record<string, IntakeUiErrorKind>> = {
  INTAKE_NOT_ASSIGNEE: "not-assignee",
  OWNER_CHECK_NOT_ALLOWED: "check-not-allowed",
  CASE_NOT_ALLOWED: "case-not-allowed",
  INTAKE_SELECTION_INVALID: "selection-invalid",
  LINK_MAPPING_INVALID: "link-invalid",
  CONCURRENT_MODIFICATION: "stale",
  INTAKE_STATE: "state",
  OWNER_PROOF_REQUIRED: "proof-required",
  CANONICAL_UNRECONCILED: "canonical",
  INTAKE_CREATE_NOT_ALLOWED: "create-not-allowed",
  INTAKE_DISPUTED: "disputed",
  INTAKE_SOURCE_INVALID: "source-invalid",
  AVAILABILITY_NOT_CONFIRMED: "availability",
  INTAKE_PREVIEW_STALE: "preview-stale",
  INTAKE_DUPLICATE_CHECK: "duplicate-check",
  INTAKE_ALREADY_COMPLETED: "already-completed",
  OWNER_REQUEST_LIMIT: "request-limit",
  RATE_LIMITED: "rate-limited",
};

const GATE_REASONS: ReadonlySet<string> = new Set<GateReason>([
  "NOT_LONG_TERM",
  "NOT_QUALIFIED",
  "NO_PASSED",
  "PASSED_NOT_USABLE",
  "TYPE_SCOPE_MISMATCH",
  "RECONCILIATION_REQUIRED",
  "RESTRICTED",
]);

const GATE_FIELD = "gate.";

const withCorrelation = (value: IntakeUiError, correlationId: string | undefined): IntakeUiError =>
  correlationId === undefined ? value : { ...value, correlationId };

/**
 * Maps a call result to its UI case by `code`, never its message; null for a success. Never throws. An unknown 409 is
 * `stale` (the page reads again), an unknown 403 `forbidden`, and an unknown 429, 5xx or lost answer `retry`.
 */
export function toIntakeUiError(result: ApiResult<unknown>): IntakeUiError | null {
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

  const { status, code, fieldErrors, correlationId } = result;
  if (code === "INTAKE_GATE_FAILED") {
    const gateReasons = fieldErrors
      .filter(({ field }) => field.startsWith(GATE_FIELD))
      .map(({ field }) => field.slice(GATE_FIELD.length))
      .filter((reason): reason is GateReason => GATE_REASONS.has(reason));
    return withCorrelation({ kind: "gate", gateReasons }, correlationId);
  }
  if (code !== undefined && Object.hasOwn(BY_CODE, code)) return withCorrelation({ kind: BY_CODE[code] }, correlationId);
  switch (status) {
    case 400:
      return withCorrelation({ kind: "validation", fields: [...new Set(fieldErrors.map(({ field }) => field))] }, correlationId);
    case 403:
      return withCorrelation({ kind: "forbidden" }, correlationId);
    case 404:
      return withCorrelation({ kind: "not-found" }, correlationId);
    case 409:
      return withCorrelation({ kind: "stale" }, correlationId);
    default:
      return withCorrelation({ kind: "retry" }, correlationId);
  }
}

/** The facts of the lead this feature needs; nothing else of the answer stays in its state. */
export type LeadFacts = { assignedUserId: string | null; requestCode: string | null; wardCode: string | null };

/** GET the lead: who the assignee is, because the block names no user. */
export async function getLeadFacts(leadId: string, deps: IntakeDeps = DEFAULT_DEPS): Promise<ApiResult<LeadFacts>> {
  const result = await deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}", { params: { path: { leadId } } }),
  );
  if (!result.ok) return result;
  const { assignedUserId, requestCode, wardCode } = result.data;
  return { ...result, data: { assignedUserId: assignedUserId ?? null, requestCode: requestCode ?? null, wardCode: wardCode ?? null } };
}

/** GET the block: 404 while the switch is off or the lead cannot be seen. */
export function getIntakeBlock(leadId: string, deps: IntakeDeps = DEFAULT_DEPS): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/inventory-intake", { params: { path: { leadId } } }),
  );
}

/**
 * PUT the selection: a different selection voids any request and proof and clears the target and availability; the
 * same parts again change nothing (spec 4.2, property-create SV-202).
 */
export function putSelection(
  leadId: string,
  input: SelectionInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/owner-leads/{leadId}/inventory-intake/selection", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

/** POST the owner request: the answer is the same whether or not the email matches an account (D5-5). */
export function askOwnerConfirmation(
  leadId: string,
  input: OwnerRequestInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<OwnerRequestIssued>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/owner-confirmation", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

/** GET the owner's properties, by a property code or by a ward code with text (spec 4.7). */
export function searchInventory(
  leadId: string,
  query: InventorySearchQuery,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<InventorySearchPage>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/inventory-intake/inventory-search", {
      params: { path: { leadId }, query },
    }),
  );
}

/** PUT the target; 200 can read CASE_OPEN when a case opens. */
export function putTarget(
  leadId: string,
  input: IntakeTargetInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/owner-leads/{leadId}/inventory-intake/target", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

export function putAvailability(
  leadId: string,
  input: IntakeAvailabilityInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/owner-leads/{leadId}/inventory-intake/availability", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

export function getIntakePreview(leadId: string, deps: IntakeDeps = DEFAULT_DEPS): Promise<ApiResult<IntakePreview>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/inventory-intake/preview", { params: { path: { leadId } } }),
  );
}

/** POST the completion: a repeat with an equal `previewHash` answers the stored result (spec 5.3). */
export function completeIntake(
  leadId: string,
  input: IntakeCompletionInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeCompletionResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/completion", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

export function restoreIntake(
  leadId: string,
  input: IntakeRestorationInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/restoration", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

/** GET the owner check context: a manager who has not worked the lead; the server writes an access log row. */
export function getOwnerCheckContext(
  leadId: string,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<OwnerCheckContext>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/inventory-intake/owner-check-context", {
      params: { path: { leadId } },
    }),
  );
}

/** POST a start: the only answer that holds the phrase. */
export function startOwnerCheck(
  leadId: string,
  input: OwnerCheckInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<OwnerCheckStarted>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/owner-check/start", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

export function refuseOwnerCheck(
  leadId: string,
  input: OwnerCheckInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/owner-check/refusal", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

export function addSuspension(
  leadId: string,
  input: IntakeSuspensionInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/suspensions", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

export function releaseSuspension(
  leadId: string,
  suspensionId: string,
  input: IntakeReleaseInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<IntakeBlock>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/inventory-intake/suspensions/{id}/release", {
      params: { path: { leadId, id: suspensionId } },
      body: input,
    }),
  );
}
