import type { ApiResult } from "@/features/auth/client";

import type { ListingLiveDifference, ListingLiveRevision } from "../types";

import { revisionPanelModel, type RevisionTermsScreen } from "./revision-model";
import type { ListingKey, Phrase } from "./revision-text";

type ComparedPart = ListingLiveDifference["changedParts"][number];

/** A changed part's label (E06S6-D12); a part this UI does not know reads "Another part", so it is never dropped. */
const PART_KEYS: Record<ComparedPart, ListingKey> = {
  TITLE: "liveDifference.parts.TITLE",
  DESCRIPTION: "liveDifference.parts.DESCRIPTION",
  FEATURES: "liveDifference.parts.FEATURES",
  TERMS: "liveDifference.parts.TERMS",
};

/** The live revision's value of one changed part, as text and lines only (the live content is the Sale's content). */
export type LivePartValue =
  | { part: "TITLE"; text: string }
  | { part: "DESCRIPTION"; text: string }
  | { part: "FEATURES"; lines: Phrase[] }
  | { part: "TERMS"; terms: RevisionTermsScreen | null };

/**
 * "Changes from the live revision" on the review page (listing-publish US-4 AC-2, spec section 6, E06S6-D12). `none`:
 * the one 404 or a session answer, which show nothing; `compared`: the live revision, its time, the changed parts'
 * labels in the answer's order and the live value of each; `noLive` and `isLive` one sentence each. The server
 * compares; the UI only shows what it answered.
 */
export type LiveDifferenceModel =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "none" }
  | { kind: "noLive" }
  | { kind: "isLive" }
  | { kind: "compared"; liveRevisionNo: number; wentLiveAt: string; changedPartKeys: ListingKey[]; values: LivePartValue[] };

function partKey(code: string): ListingKey {
  return Object.hasOwn(PART_KEYS, code) ? (PART_KEYS[code as ComparedPart] as ListingKey) : "liveDifference.parts.OTHER";
}

/**
 * The live revision's features and terms as the read-only revision shows them: the revision panel's own screen of a
 * revision read, built from the live revision's content (no unit, no problems, no submission time are shown).
 */
function liveScreen(live: ListingLiveRevision) {
  const panel = revisionPanelModel(
    {
      ok: true,
      status: 200,
      replayed: false,
      data: {
        listingId: "",
        revisionNo: live.revisionNo,
        status: "LIVE",
        createdAt: live.wentLiveAt,
        updatedAt: live.wentLiveAt,
        title: live.title,
        description: live.description,
        features: live.features,
        termsSnapshot: live.terms,
        unitSnapshot: null,
        submittedAt: null,
        dataVersion: 0,
        problems: [],
      },
    },
    { openRevisionNo: null, dataVersion: 0, viewerMayDraft: false },
  );
  return panel.kind === "ready" ? panel.screen : null;
}

function valueOf(code: string, live: ListingLiveRevision, screen: NonNullable<ReturnType<typeof liveScreen>>): LivePartValue | null {
  switch (code) {
    case "TITLE":
      return { part: "TITLE", text: live.title };
    case "DESCRIPTION":
      return { part: "DESCRIPTION", text: live.description };
    case "FEATURES":
      return { part: "FEATURES", lines: screen.features };
    case "TERMS":
      return { part: "TERMS", terms: screen.terms };
    default:
      return null;
  }
}

/** The section's model from the live difference read; null while it has not answered. */
export function liveDifferenceModel(result: ApiResult<ListingLiveDifference> | null): LiveDifferenceModel {
  if (result === null) return { kind: "loading" };
  if (result.ok) {
    const difference = result.data;
    switch (difference.comparison) {
      case "NO_LIVE_REVISION":
        return { kind: "noLive" };
      case "IS_LIVE_REVISION":
        return { kind: "isLive" };
      case "COMPARED": {
        const live = difference.live;
        const screen = live === null ? null : liveScreen(live);
        if (live === null || screen === null) return { kind: "error" };
        return {
          kind: "compared",
          liveRevisionNo: live.revisionNo,
          wentLiveAt: live.wentLiveAt,
          changedPartKeys: difference.changedParts.map(partKey),
          values: difference.changedParts.flatMap((code) => valueOf(code, live, screen) ?? []),
        };
      }
      default:
        return { kind: "error" };
    }
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
