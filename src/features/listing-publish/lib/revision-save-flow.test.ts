import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange, ListingRevisionContentBody } from "../types";

import type { RevisionFormValues } from "./revision-form";
import { runRevisionSave } from "./revision-save-flow";

const LISTING_ID = "01JG000000000000000000000L";

const VALUES: RevisionFormValues = {
  title: "Phòng trọ gần trường",
  description: "  ",
  features: {
    furnishing: "BASIC",
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: "PRIVATE",
    balcony: false,
    elevator: false,
    motorbikeParking: true,
    carParking: false,
    internet: true,
    pets: null,
    noSharedLandlord: true,
  },
};

function deps(answer: ApiResult<ListingRevisionChange>) {
  return {
    save: vi.fn<(listingId: string, revisionNo: number, body: ListingRevisionContentBody) => Promise<ApiResult<ListingRevisionChange>>>(
      () => Promise.resolve(answer),
    ),
    reread: vi.fn<() => void>(),
  };
}

describe("runRevisionSave (listing-publish US-2 AC-1, AC-3, spec section 6)", () => {
  it("runRevisionSave_ok_doneAndRereadOnce: a 200 is done; one PUT of the whole content with the data version, a blank text as null; one re-read", async () => {
    const d = deps({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 4 } });

    expect(await runRevisionSave(LISTING_ID, 1, VALUES, 3, d)).toEqual({ kind: "done" });
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.save).toHaveBeenCalledWith(LISTING_ID, 1, {
      dataVersion: 3,
      title: "Phòng trọ gần trường",
      description: null,
      features: VALUES.features,
    });
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionSave_titleEntry_validationTitle: a 400 with the title entry reads the title's sentence; the panel reads again", async () => {
    const d = deps({
      ok: false,
      kind: "http",
      status: 400,
      code: "VALIDATION_FAILED",
      fieldErrors: [{ field: "title", message: "Fixed server message." }],
    });

    expect(await runRevisionSave(LISTING_ID, 1, VALUES, 3, d)).toEqual({ kind: "refused", answer: "validationTitle", problems: [] });
    expect(d.reread).toHaveBeenCalledTimes(1);
  });

  it("runRevisionSave_concurrent_refusedAndReread: 409 CONCURRENT_MODIFICATION is refused; the panel reads again for the new version", async () => {
    const d = deps({ ok: false, kind: "http", status: 409, code: "CONCURRENT_MODIFICATION", fieldErrors: [] });

    expect(await runRevisionSave(LISTING_ID, 1, VALUES, 3, d)).toEqual({ kind: "refused", answer: "concurrent", problems: [] });
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.reread).toHaveBeenCalledTimes(1);

    const silent = deps({ ok: false, kind: "signed-out" });
    expect(await runRevisionSave(LISTING_ID, 1, VALUES, 3, silent)).toEqual({ kind: "silent" });
    expect(silent.reread).not.toHaveBeenCalled();
  });
});
