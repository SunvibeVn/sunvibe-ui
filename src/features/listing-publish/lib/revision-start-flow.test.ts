import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { runRevisionStart } from "./revision-start-flow";

const LISTING_ID = "01JG000000000000000000000L";

function deps(answer: ApiResult<ListingRevisionChange>) {
  return {
    start: vi.fn<(listingId: string, dataVersion: number) => Promise<ApiResult<ListingRevisionChange>>>(() => Promise.resolve(answer)),
    reread: vi.fn<() => void>(),
  };
}

describe("runRevisionStart (listing-publish US-2 AC-6, spec section 6)", () => {
  it("runRevisionStart_created_doneAndReread: a 201 is done; the start is sent once with the data version and the panel reads again once", async () => {
    const d = deps({ ok: true, status: 201, replayed: false, data: { listingId: LISTING_ID, revisionNo: 2, status: "DRAFT", dataVersion: 6 } });

    expect(await runRevisionStart(LISTING_ID, 5, d)).toEqual({ kind: "done" });
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.start).toHaveBeenCalledWith(LISTING_ID, 5);
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionStart_openExists_refusedAndReread: 409 OPEN_REVISION_EXISTS is refused with its answer; the panel reads again", async () => {
    const d = deps({ ok: false, kind: "http", status: 409, code: "OPEN_REVISION_EXISTS", fieldErrors: [] });

    expect(await runRevisionStart(LISTING_ID, 5, d)).toEqual({ kind: "refused", answer: "openExists", problems: [] });
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionStart_signedOut_silentNoReread: a session answer is silent and reads nothing again", async () => {
    for (const answer of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingRevisionChange>[]) {
      const d = deps(answer);
      expect(await runRevisionStart(LISTING_ID, 5, d)).toEqual({ kind: "silent" });
      expect(d.start).toHaveBeenCalledTimes(1);
      expect(d.reread).not.toHaveBeenCalled();
    }
  });
});
