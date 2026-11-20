import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { runTermsCapture } from "./terms-capture-flow";

const LISTING_ID = "01JG000000000000000000000L";

type Source = "IN_EFFECT" | "PENDING_START";

function deps(answer: ApiResult<ListingRevisionChange>) {
  return {
    capture: vi.fn<(listingId: string, revisionNo: number, dataVersion: number, source: Source) => Promise<ApiResult<ListingRevisionChange>>>(
      () => Promise.resolve(answer),
    ),
    reread: vi.fn<() => void>(),
    rereadSources: vi.fn<() => void>(),
  };
}

describe("runTermsCapture (listing-publish US-2 AC-2, spec section 6)", () => {
  it("runTermsCapture_ok_doneAndReread: a 200 is done; one PUT of the chosen source with the data version; the panel reads again", async () => {
    const d = deps({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 5 } });

    expect(await runTermsCapture(LISTING_ID, 1, 4, "PENDING_START", d)).toEqual({ kind: "done" });
    expect(d.capture).toHaveBeenCalledTimes(1);
    expect(d.capture).toHaveBeenCalledWith(LISTING_ID, 1, 4, "PENDING_START");
    expect(d.reread).toHaveBeenCalledTimes(1);
    expect(d.rereadSources).not.toHaveBeenCalled();
  });

  it("runTermsCapture_termsSourceAbsent_sentenceAndSourcesReread: 409 TERMS_SOURCE_ABSENT reads its sentence; the panel and the sources read again", async () => {
    const d = deps({ ok: false, kind: "http", status: 409, code: "TERMS_SOURCE_ABSENT", fieldErrors: [] });

    expect(await runTermsCapture(LISTING_ID, 1, 4, "IN_EFFECT", d)).toEqual({ kind: "refused", answer: "termsAbsent", problems: [] });
    expect(d.capture).toHaveBeenCalledTimes(1);
    expect(d.reread).toHaveBeenCalledTimes(1);
    expect(d.rereadSources).toHaveBeenCalledTimes(1);

    // Another refusal reads the panel again, not the sources.
    const notDraft = deps({ ok: false, kind: "http", status: 409, code: "REVISION_NOT_DRAFT", fieldErrors: [] });
    expect(await runTermsCapture(LISTING_ID, 1, 4, "IN_EFFECT", notDraft)).toEqual({ kind: "refused", answer: "notDraft", problems: [] });
    expect(notDraft.reread).toHaveBeenCalledTimes(1);
    expect(notDraft.rereadSources).not.toHaveBeenCalled();
  });

  it("runTermsCapture_noAnswer_failed: no answer and a 500 read 'Something went wrong'; the panel reads again; a session answer is silent", async () => {
    for (const answer of [
      { ok: false, kind: "network" },
      { ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] },
    ] as ApiResult<ListingRevisionChange>[]) {
      const d = deps(answer);
      expect(await runTermsCapture(LISTING_ID, 1, 4, "IN_EFFECT", d)).toEqual({ kind: "refused", answer: "failed", problems: [] });
      expect(d.reread).toHaveBeenCalledTimes(1);
      expect(d.rereadSources).not.toHaveBeenCalled();
    }

    const silent = deps({ ok: false, kind: "unavailable" });
    expect(await runTermsCapture(LISTING_ID, 1, 4, "IN_EFFECT", silent)).toEqual({ kind: "silent" });
    expect(silent.reread).not.toHaveBeenCalled();
    expect(silent.rereadSources).not.toHaveBeenCalled();
  });
});
