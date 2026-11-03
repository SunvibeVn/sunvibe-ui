import { callApi, type ApiResult } from "@/features/auth/client";

import type { MediaVariant } from "../types";

import type { SurveysDeps } from "./surveys-api";

// Images of survey photos (survey-media spec 6.2 images, A-25): read with the session client as a blob, never through
// an <img src> to the API (it carries no Bearer) or `next/image`. The deadlines are the server's own: 60 s for the
// thumbnail and preview, 300 s for the full file, the body read included.

export const IMAGE_TIMEOUT_MS: Readonly<Record<MediaVariant, number>> = Object.freeze({
  thumbnail: 60_000,
  preview: 60_000,
  full: 300_000,
});

/** A 200 that is not `image/jpeg`: nothing is shown (an object URL is made only from a JPEG, spec 6.2). */
export type ImageNotJpeg = { ok: false; kind: "not-jpeg" };
export type ImageResult = ApiResult<Blob> | ImageNotJpeg;

const NOT_JPEG: ImageNotJpeg = Object.freeze({ ok: false, kind: "not-jpeg" });

const isJpeg = (contentType: string | null): boolean =>
  contentType !== null && contentType.split(";")[0].trim().toLowerCase() === "image/jpeg";

const DEFAULT_DEPS: SurveysDeps = { callApi };

/**
 * GET /api/v1/staff/survey-media/{mediaId}/content/{variant}; `download` (full only) asks the download form, which the
 * server logs as a download (A-6). The blob is typed `image/jpeg` whatever the answer's parameters.
 */
export async function getMediaImage(
  mediaId: string,
  variant: MediaVariant,
  options: { download?: boolean } = {},
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ImageResult> {
  const download = variant === "full" && options.download === true;
  let contentType: string | null = null;
  const result = await deps.callApi(
    async (client) => {
      const answer = await client.GET("/api/v1/staff/survey-media/{mediaId}/content/{variant}", {
        params: { path: { mediaId, variant }, query: download ? { download: "true" } : {} },
        parseAs: "blob",
      });
      contentType = answer.response.headers.get("Content-Type");
      return answer;
    },
    { timeoutMs: IMAGE_TIMEOUT_MS[variant] },
  );
  if (!result.ok) return result;
  if (!isJpeg(contentType) || !(result.data instanceof Blob)) return NOT_JPEG;
  return { ...result, data: new Blob([result.data], { type: "image/jpeg" }) };
}
