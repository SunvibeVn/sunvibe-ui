import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { runRevisionSubmit } from "./revision-submit-flow";

const LISTING_ID = "01JG000000000000000000000L";

function deps(answer: ApiResult<ListingRevisionChange>) {
  return {
    submit: vi.fn<(listingId: string, revisionNo: number, dataVersion: number) => Promise<ApiResult<ListingRevisionChange>>>(() =>
      Promise.resolve(answer),
    ),
    reread: vi.fn<() => void>(),
  };
}

describe("runRevisionSubmit (listing-publish US-2 AC-4, AC-5, spec section 6)", () => {
  it("runRevisionSubmit_ok_done: a 200 is done; one POST with the data version; the panel reads again", async () => {
    const d = deps({
      ok: true,
      status: 200,
      replayed: false,
      data: { listingId: LISTING_ID, revisionNo: 1, status: "PENDING_REVIEW", dataVersion: 9 },
    });

    expect(await runRevisionSubmit(LISTING_ID, 1, 8, d)).toEqual({ kind: "done" });
    expect(d.submit).toHaveBeenCalledTimes(1);
    expect(d.submit).toHaveBeenCalledWith(LISTING_ID, 1, 8);
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionSubmit_unprocessable_entriesInOrder: 422 REVISION_NOT_SUBMITTABLE answers its entries as problems, in the server's order", async () => {
    const fields = ["title.TOO_SHORT", "description.REQUIRED", "terms.REQUIRED", "title.PHONE_NUMBER", "description.EMAIL"];
    const d = deps({
      ok: false,
      kind: "http",
      status: 422,
      code: "REVISION_NOT_SUBMITTABLE",
      fieldErrors: fields.map((field) => ({ field, message: "Fixed server message." })),
    });

    expect(await runRevisionSubmit(LISTING_ID, 1, 8, d)).toEqual({
      kind: "refused",
      answer: "notSubmittable",
      problems: [
        { part: "TITLE", rule: "TOO_SHORT" },
        { part: "DESCRIPTION", rule: "REQUIRED" },
        { part: "TERMS", rule: "REQUIRED" },
        { part: "TITLE", rule: "PHONE_NUMBER" },
        { part: "DESCRIPTION", rule: "EMAIL" },
      ],
    });
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionSubmit_notDraft_refused: 409 REVISION_NOT_DRAFT is refused without problems; the panel reads again", async () => {
    const d = deps({ ok: false, kind: "http", status: 409, code: "REVISION_NOT_DRAFT", fieldErrors: [] });

    expect(await runRevisionSubmit(LISTING_ID, 1, 8, d)).toEqual({ kind: "refused", answer: "notDraft", problems: [] });
    expect(d.reread).toHaveBeenCalledTimes(1);
  });
});
