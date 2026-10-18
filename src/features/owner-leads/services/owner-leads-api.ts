import type { components } from "@/api/generated/schema";
import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";
import { createPublicClient, toPublicResult, type PublicApiResult } from "@/lib/api";

import { dedupeInflight } from "../lib/inflight";
import type { ListApiQuery, Scope } from "../lib/list-url-state";
import type {
  EligibleAssignee,
  LeadDetail,
  LeadNoteResult,
  LeadPage,
  LeadStatus,
  LeadSummary,
  Ward,
} from "../types";

type Schemas = components["schemas"];

/** Signed-in calls go through `callApi` (Bearer from memory); tests pass a fake. */
export type OwnerLeadsDeps = { callApi: CallApi };

const DEFAULT_DEPS: OwnerLeadsDeps = { callApi };

/** The only province of the pilot (Đà Nẵng). */
export const PROVINCE_CODE = "48";

/** A request-code lookup finds at most one lead; a small page is enough. */
const CODE_LOOKUP_SIZE = 5;

/** The wards endpoint is public: an anonymous client, never a Bearer (data-fetching.mdc). Tests pass a fake client. */
export type WardsDeps = { client?: ReturnType<typeof createPublicClient> };

export type AddNoteInput = Pick<Schemas["AddLeadNoteRequest"], "note" | "nextActionAt">;
export type ChangeStatusInput = Omit<Schemas["ChangeLeadStatusRequest"], "toStatus"> & { toStatus: LeadStatus };
export type AssignLeadInput = Schemas["AssignLeadRequest"];

/** GET /api/v1/staff/owner-leads. `query` comes from `toApiQuery`, which never holds an empty value. */
export function listLeads(query: ListApiQuery, deps: OwnerLeadsDeps = DEFAULT_DEPS): Promise<ApiResult<LeadPage>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/owner-leads", { params: { query } }));
}

/**
 * GET /api/v1/staff/owner-leads/{leadId}. Calls for the same lead by the same user that overlap share one request (dev
 * double render, a retry while loading); a settled answer is never kept, so every open reads the server again. The key
 * holds `userId` (the signed-in user's id), so a request started for one user is never handed to another one who signs
 * in while it is still running (spec 5.2).
 */
export function getLead(
  leadId: string,
  userId: string,
  deps: OwnerLeadsDeps = DEFAULT_DEPS,
): Promise<ApiResult<LeadDetail>> {
  return detailLoader(deps)({ leadId, userId });
}

type DetailKey = { leadId: string; userId: string };

const detailLoaders = new WeakMap<CallApi, (key: DetailKey) => Promise<ApiResult<LeadDetail>>>();

/** One in-flight table per `callApi`, so a fake in a test never meets the real one; keys are `userId` + `leadId`. */
function detailLoader(deps: OwnerLeadsDeps): (key: DetailKey) => Promise<ApiResult<LeadDetail>> {
  let loader = detailLoaders.get(deps.callApi);
  if (loader === undefined) {
    const byKey = dedupeInflight((joined: string) => {
      const leadId = joined.slice(joined.indexOf(":") + 1);
      return deps.callApi((client) =>
        client.GET("/api/v1/staff/owner-leads/{leadId}", { params: { path: { leadId } } }),
      );
    });
    // A user id is alphanumeric, so the first ":" always ends it.
    loader = ({ leadId, userId }) => byKey(`${userId}:${leadId}`);
    detailLoaders.set(deps.callApi, loader);
  }
  return loader;
}

/** POST /api/v1/staff/owner-leads/{leadId}/activities. */
export function addNote(
  leadId: string,
  input: AddNoteInput,
  deps: OwnerLeadsDeps = DEFAULT_DEPS,
): Promise<ApiResult<LeadNoteResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/activities", { params: { path: { leadId } }, body: input }),
  );
}

/** POST /api/v1/staff/owner-leads/{leadId}/status-changes. */
export function changeStatus(
  leadId: string,
  input: ChangeStatusInput,
  deps: OwnerLeadsDeps = DEFAULT_DEPS,
): Promise<ApiResult<LeadSummary>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/status-changes", { params: { path: { leadId } }, body: input }),
  );
}

/** POST /api/v1/staff/owner-leads/{leadId}/assign. */
export function assignLead(
  leadId: string,
  input: AssignLeadInput,
  deps: OwnerLeadsDeps = DEFAULT_DEPS,
): Promise<ApiResult<LeadSummary>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/assign", { params: { path: { leadId } }, body: input }),
  );
}

/** GET /api/v1/staff/owner-lead-assignees (not paged, at most 500). */
export function listAssignees(deps: OwnerLeadsDeps = DEFAULT_DEPS): Promise<ApiResult<EligibleAssignee[]>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/owner-lead-assignees"));
}

/**
 * GET /api/v1/public/provinces/48/wards through the anonymous client (no Bearer). Never throws: a client that cannot
 * be built (missing API URL) is a `network` result, like a failed request.
 */
export async function listWards(deps: WardsDeps = {}): Promise<PublicApiResult<Ward[]>> {
  try {
    const client = deps.client ?? createPublicClient();
    return await toPublicResult(
      client.GET("/api/v1/public/provinces/{provinceCode}/wards", {
        params: { path: { provinceCode: PROVINCE_CODE } },
      }),
    );
  } catch {
    return { ok: false, kind: "network" };
  }
}

/**
 * Finds one lead by its request code in `scope` ("all" for an `ALL` viewer, "mine" otherwise). No `status` is sent,
 * so a closed original is found too (spec 5.4, C-21).
 */
export function findLeadByRequestCode(
  code: string,
  scope: Extract<Scope, "mine" | "all">,
  deps: OwnerLeadsDeps = DEFAULT_DEPS,
): Promise<ApiResult<LeadPage>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads", {
      params: { query: { requestCode: code, scope, page: 0, size: CODE_LOOKUP_SIZE } },
    }),
  );
}
