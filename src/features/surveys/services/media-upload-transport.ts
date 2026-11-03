import { type ApiResult, uploadWithBearer, type UploadWithBearer } from "@/features/auth/client";

import type { MediaContentAnswer } from "../types";

// The content upload of a survey photo (survey-media spec 6.2, PD-11): `PUT /survey-media/{id}/content` with the raw
// bytes, `Content-Type: application/octet-stream` and the RFC 9530 `Content-Digest`, through the auth client's
// `uploadWithBearer` (XMLHttpRequest for the upload progress; the in-memory Bearer, one refresh and retry on a 401,
// credentials omitted, only the API origin; the token never leaves the auth module). A stall (no progress for 60 s),
// a network error or a refused connection all answer `network`: "state unknown", the uploader reads the list before
// it sends again (SM-22).

export type UploadInput = {
  mediaId: string;
  /** The bytes of the photo as picked; `Content-Length` is its size, which the create declared as `sizeBytes`. */
  file: Blob;
  /** `sha-256=:<base64>:` of the same bytes (RFC 9530), equal to the create's `contentSha256`. */
  contentDigest: string;
  onProgress?: (sent: number, total: number) => void;
  /** Aborts the upload (the row was cancelled, the page left). */
  signal?: AbortSignal;
};

export type UploadAborted = { ok: false; kind: "aborted" };
/** `network` = state unknown (network error, stall, refused connection); `signed-out` also after a sign-out mid-way. */
export type UploadResult = ApiResult<MediaContentAnswer> | UploadAborted;

export type UploadTransportDeps = {
  uploadWithBearer: UploadWithBearer;
  /** No progress for this long ends the upload as state unknown (spec 6.2: 60 s). */
  stallMs?: number;
};

export const UPLOAD_STALL_MS = 60_000;

export function createUploadTransport(deps: UploadTransportDeps) {
  /** Sends the photo's bytes once (and once more after a refreshed token); never throws. */
  return async function upload(input: UploadInput): Promise<UploadResult> {
    const result = await deps.uploadWithBearer({
      path: `/api/v1/staff/survey-media/${encodeURIComponent(input.mediaId)}/content`,
      body: input.file,
      headers: { "Content-Type": "application/octet-stream", "Content-Digest": input.contentDigest },
      onProgress: input.onProgress,
      signal: input.signal,
      stallMs: deps.stallMs ?? UPLOAD_STALL_MS,
    });
    // A 2xx body is the API's SurveyMediaContentResponse (contract of 7749ffc).
    return result as UploadResult;
  };
}

const defaultUpload = createUploadTransport({ uploadWithBearer });

/** The tab's upload of a photo's content. Never throws. */
export function uploadMediaContent(input: UploadInput): Promise<UploadResult> {
  return defaultUpload(input);
}
