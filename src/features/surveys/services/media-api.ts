import { callApi, type ApiResult } from "@/features/auth/client";

import type {
  MediaContentAnswer,
  MediaCreated,
  MediaCreateInput,
  MediaHoldReason,
  MediaList,
  MediaRemovalInput,
  MediaStateAnswer,
} from "../types";

import type { SurveysDeps } from "./surveys-api";

// The JSON endpoints of survey photos (survey-media spec 7.1) through `callApi`: the Bearer from memory, credentials
// omitted, one refresh on a 401. The content PUT has its own transport (media-upload-transport.ts) and images their
// own reader (media-image-client.ts).

const DEFAULT_DEPS: SurveysDeps = { callApi };

/**
 * The `knownVersion` of a list (A-30): `setVersion.identificationVersion.conditionVersion.checklistVersion.stateEpoch.
 * viewDigest` of the last answer applied; null when the list lacks one of them (the next poll asks without it).
 */
export function knownVersionOf(list: MediaList): string | null {
  const basis = list.basis;
  const parts = [
    list.setVersion,
    basis?.identificationVersion,
    basis?.conditionVersion,
    basis?.checklistVersion,
    basis?.stateEpoch,
    basis?.viewDigest,
  ];
  if (parts.some((part) => part === undefined || part === null || part === "")) return null;
  return parts.join(".");
}

/**
 * GET /api/v1/staff/survey-checklists/{checklistId}/media. With the `knownVersion` of the list on screen the server
 * answers 204 when nothing changed: `data` is then null and the screen keeps its list.
 */
export async function listMedia(
  checklistId: string,
  knownVersion: string | null,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<MediaList | null>> {
  const result = await deps.callApi((client) =>
    client.GET("/api/v1/staff/survey-checklists/{checklistId}/media", {
      params: { path: { checklistId }, query: knownVersion === null ? {} : { knownVersion } },
    }),
  );
  if (result.ok && (result.status === 204 || result.data === undefined)) return { ...result, data: null };
  return result;
}

/** POST /api/v1/staff/survey-checklists/{checklistId}/media: 201 a new photo record, 200 the replay of its `uploadKey`. */
export function createMedia(
  checklistId: string,
  input: MediaCreateInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<MediaCreated>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-checklists/{checklistId}/media", { params: { path: { checklistId } }, body: input }),
  );
}

/** POST /api/v1/staff/survey-media/{mediaId}/removal: by the holder, with the BR-12 correction when the server asks. */
export function removeMedia(
  mediaId: string,
  input: MediaRemovalInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<MediaContentAnswer>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-media/{mediaId}/removal", { params: { path: { mediaId } }, body: input }),
  );
}

/** POST /api/v1/staff/survey-media/{mediaId}/hold (ADMIN, A-23): already held answers 200 unchanged. */
export function holdMedia(
  mediaId: string,
  reason: MediaHoldReason,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<MediaStateAnswer>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-media/{mediaId}/hold", { params: { path: { mediaId } }, body: { reason } }),
  );
}

/** POST /api/v1/staff/survey-media/{mediaId}/hold-release (ADMIN, A-23): not held answers 200 unchanged. */
export function releaseMediaHold(mediaId: string, deps: SurveysDeps = DEFAULT_DEPS): Promise<ApiResult<MediaStateAnswer>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-media/{mediaId}/hold-release", { params: { path: { mediaId } }, body: {} }),
  );
}
