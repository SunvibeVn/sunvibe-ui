import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingRevisionChange } from "../types";

import { runRevisionCopy } from "./revision-copy-flow";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LISTING_ID = "01JG000000000000000000000L";

const http = (status: number, code: string): ApiResult<ListingRevisionChange> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

async function outcomeOf(result: ApiResult<ListingRevisionChange>) {
  const copy = vi.fn(async () => result);
  const reread = vi.fn<() => void>();
  const outcome = await runRevisionCopy({ listingId: LISTING_ID, revisionNo: 2, dataVersion: 7 }, { copy, reread });
  return { outcome, copy, reread };
}

describe("revision copy flow (listing-publish US-2 AC-6, E06S4-D14, P13)", () => {
  it("runRevisionCopy_answers_outcomeByCode: one request with the listing's data version; each answer maps by status and code; every answer but a session answer reads the listing again", async () => {
    const copied = await outcomeOf({ ok: true, status: 201, replayed: false, data: { listingId: LISTING_ID, revisionNo: 3, status: "DRAFT", dataVersion: 8 } });
    expect(copied.outcome).toEqual({ kind: "copied" });
    expect(copied.copy).toHaveBeenCalledTimes(1);
    expect(copied.copy).toHaveBeenCalledWith(LISTING_ID, 2, 7);
    expect(copied.reread).toHaveBeenCalledTimes(1);

    const rows: [ApiResult<ListingRevisionChange>, string][] = [
      [http(409, "OPEN_REVISION_EXISTS"), "A draft is already open."],
      [http(409, "REVISION_NOT_COPYABLE"), "This revision cannot be copied."],
      [http(409, "CONCURRENT_MODIFICATION"), "Someone changed this listing. It has been reloaded."],
      [http(409, "LISTING_ARCHIVED"), "This listing is archived."],
      [http(403, "FORBIDDEN"), "Only the Sale in charge of this listing can copy it."],
      [http(404, "NOT_FOUND"), "This listing or revision is no longer available to you."],
      [http(400, "VALIDATION_FAILED"), "Something went wrong. Try again."],
      [http(409, "SOMETHING_NEW"), "Something went wrong. Try again."],
      [http(500, "INTERNAL_ERROR"), "Something went wrong. Try again."],
      [{ ok: false, kind: "network" }, "Something went wrong. Try again."],
    ];
    for (const [result, sentence] of rows) {
      const { outcome, reread } = await outcomeOf(result);
      if (outcome.kind !== "refused") throw new Error(`expected refused, got ${outcome.kind}`);
      expect(t(outcome.sentence)).toBe(sentence);
      expect(reread).toHaveBeenCalledTimes(1);
    }

    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingRevisionChange>[]) {
      const { outcome, reread } = await outcomeOf(result);
      expect(outcome).toEqual({ kind: "silent" });
      expect(reread).not.toHaveBeenCalled();
    }
  });
});
