import type { ApiResult } from "@/features/auth/client";

import type { ListingDisplayAnswer, ListingPublication } from "../types";

import { reasonGroupKey, type ReasonGroupKey } from "./listing-text";
import { displayReasonKey } from "./publication-text";
import type { ListingKey } from "./revision-text";

/** A display answer as the section shows it: whether it holds, its reasons in order and E05's groups, as keys. */
export type DisplayLines = { holds: boolean; reasonKeys: ListingKey[]; groupKeys: ReasonGroupKey[] };

/**
 * The "Publication" section of the listing page (listing-publish US-2 AC-7, US-5 AC-3, spec section 6, E06S6-D11).
 * `none`: the one 404 or a session answer, which show nothing; `archived`: a read answering ARCHIVED, which shows one
 * sentence and nothing else (US-9 AC-3); `ready`: the live revision and the Approved one waiting, each with its display
 * answer, and the hints of what the viewer may do. The server decides every command.
 */
export type PublicationModel =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "none" }
  | { kind: "archived" }
  | {
      kind: "ready";
      live: ({ revisionNo: number; wentLiveAt: string } & DisplayLines) | null;
      approved: ({ revisionNo: number } & DisplayLines) | null;
      /** "Put live": the assigned Sale, a revision Approved, the listing Unpublished or Published (a hint). */
      mayPutLive: boolean;
      /** "Copy into a new draft" beside each revision: the copy's rule, no open revision, not archived (a hint). */
      mayCopy: boolean;
      /** The listing's data version the put live and the copy send back (listing BR-3). */
      dataVersion: number;
    };

function linesOf(display: ListingDisplayAnswer): DisplayLines {
  return {
    holds: display.holds,
    reasonKeys: display.reasons.map(displayReasonKey),
    groupKeys: display.reasonGroups.map(reasonGroupKey),
  };
}

/** The section's model from the publication read; null while it has not answered. The UI computes no condition. */
export function publicationModel(result: ApiResult<ListingPublication> | null): PublicationModel {
  if (result === null) return { kind: "loading" };
  if (result.ok) {
    const publication = result.data;
    if (publication.state === "ARCHIVED") return { kind: "archived" };
    return {
      kind: "ready",
      live:
        publication.live === null
          ? null
          : { revisionNo: publication.live.revisionNo, wentLiveAt: publication.live.wentLiveAt, ...linesOf(publication.live.display) },
      approved: publication.approved === null ? null : { revisionNo: publication.approved.revisionNo, ...linesOf(publication.approved.display) },
      mayPutLive: publication.viewerMayPutLive,
      mayCopy: publication.viewerMayCopy,
      dataVersion: publication.dataVersion,
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "none" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 404 ? { kind: "none" } : { kind: "error" };
  }
}
