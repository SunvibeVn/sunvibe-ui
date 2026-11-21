import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { runRevisionWithdraw } from "./revision-withdraw-flow";

const LISTING_ID = "01JG000000000000000000000L";

function deps(answer: ApiResult<ListingRevisionChange>) {
  return {
    withdraw: vi.fn<(listingId: string, revisionNo: number, dataVersion: number) => Promise<ApiResult<ListingRevisionChange>>>(() =>
      Promise.resolve(answer),
    ),
    reread: vi.fn<() => void>(),
  };
}

describe("runRevisionWithdraw (listing-publish US-2 AC-5, spec section 6)", () => {
  it("runRevisionWithdraw_ok_done: a 200 is done; one POST with the data version; the panel reads again", async () => {
    const d = deps({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 1, status: "CANCELLED", dataVersion: 10 } });

    expect(await runRevisionWithdraw(LISTING_ID, 1, 9, d)).toEqual({ kind: "done" });
    expect(d.withdraw).toHaveBeenCalledTimes(1);
    expect(d.withdraw).toHaveBeenCalledWith(LISTING_ID, 1, 9);
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionWithdraw_notPending_refused: 409 REVISION_NOT_PENDING is refused; the panel reads again", async () => {
    const d = deps({ ok: false, kind: "http", status: 409, code: "REVISION_NOT_PENDING", fieldErrors: [] });

    expect(await runRevisionWithdraw(LISTING_ID, 1, 9, d)).toEqual({ kind: "refused", answer: "notPending", problems: [] });
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionWithdraw_serverError_failed: a 500 reads 'Something went wrong'; the panel reads again", async () => {
    const d = deps({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] });

    expect(await runRevisionWithdraw(LISTING_ID, 1, 9, d)).toEqual({ kind: "refused", answer: "failed", problems: [] });
    expect(d.withdraw).toHaveBeenCalledTimes(1);
    expect(d.reread).toHaveBeenCalledTimes(1);
  });
});
