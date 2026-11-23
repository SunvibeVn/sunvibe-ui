import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingRevisionChange } from "../types";

import { runPutLive } from "./put-live-flow";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LISTING_ID = "01JG000000000000000000000L";
const ENTRY = "This reason stops the put live.";

const http = (status: number, code: string, fields: string[] = []): ApiResult<ListingRevisionChange> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: ENTRY })),
});

async function outcomeOf(result: ApiResult<ListingRevisionChange>) {
  const putLive = vi.fn(async () => result);
  const outcome = await runPutLive({ putLive }, { listingId: LISTING_ID, revisionNo: 3, dataVersion: 9 });
  return { outcome, putLive };
}

describe("put-live flow (listing-publish E06-S6, spec sections 4.1 and 6, E06S6-D19, E06S6-P5)", () => {
  it("putLiveFlow_200_live: one request with the revision number and the publication read's data version; a 200 is live", async () => {
    const { outcome, putLive } = await outcomeOf({
      ok: true,
      status: 200,
      replayed: false,
      data: { listingId: LISTING_ID, revisionNo: 3, status: "LIVE", dataVersion: 10 },
    });
    expect(outcome).toEqual({ kind: "live" });
    expect(putLive).toHaveBeenCalledTimes(1);
    expect(putLive).toHaveBeenCalledWith(LISTING_ID, 3, 9);
  });

  it("putLiveFlow_putLiveRefused_reasonsAndGroupsFromEntries: a 409 PUT_LIVE_REFUSED lists the reasons of its reasons.<R> entries in their order and the groups of its reasonGroups.<G> entries; unknown codes read their fallback; no entry reads the fallback reason", async () => {
    const refused = await outcomeOf(
      http(409, "PUT_LIVE_REFUSED", [
        "reasons.LISTING_STATE",
        "reasons.ADVERTISING_RIGHT",
        "reasonGroups.SUSPENDED",
        "reasonGroups.NEW_GROUP",
        "reasons.UNIT_NOT_AVAILABLE",
        "reasons.FRESHNESS",
        "reasons.SOMETHING_NEW",
        "dataVersion",
      ]),
    );
    expect(refused.outcome).toEqual({
      kind: "refused",
      reasonKeys: [
        "publication.reasons.LISTING_STATE",
        "publication.reasons.ADVERTISING_RIGHT",
        "publication.reasons.UNIT_NOT_AVAILABLE",
        "publication.reasons.FRESHNESS",
        "publication.reasons.OTHER",
      ],
      groupKeys: ["reasons.SUSPENDED", "reasons.OTHER"],
    });
    if (refused.outcome.kind !== "refused") throw new Error(`expected refused, got ${refused.outcome.kind}`);
    expect(refused.outcome.groupKeys.map((key) => t(key))).toEqual(["The agreement is suspended.", "Another reason stops it."]);

    const onlyFreshness = await outcomeOf(http(409, "PUT_LIVE_REFUSED", ["reasons.FRESHNESS"]));
    expect(onlyFreshness.outcome).toEqual({ kind: "refused", reasonKeys: ["publication.reasons.FRESHNESS"], groupKeys: [] });

    const noEntry = await outcomeOf(http(409, "PUT_LIVE_REFUSED"));
    expect(noEntry.outcome).toEqual({ kind: "refused", reasonKeys: ["publication.reasons.OTHER"], groupKeys: [] });
  });

  it("putLiveFlow_staleOrNotApproved_sentenceAndReread: CONCURRENT_MODIFICATION and REVISION_NOT_APPROVED each give one sentence and ask for a re-read", async () => {
    const rows: [ApiResult<ListingRevisionChange>, string][] = [
      [http(409, "CONCURRENT_MODIFICATION"), "Someone changed this listing. It has been reloaded."],
      [http(409, "REVISION_NOT_APPROVED"), "This revision is no longer approved. It has been reloaded."],
    ];
    for (const [result, sentence] of rows) {
      const { outcome } = await outcomeOf(result);
      if (outcome.kind !== "sentence") throw new Error(`expected sentence, got ${outcome.kind}`);
      expect(t(outcome.sentence)).toBe(sentence);
      expect(outcome.reread).toBe(true);
    }
  });

  it("putLiveFlow_otherAnswers_oneSentenceEach: LISTING_ARCHIVED, 403, 404 and anything else each give one sentence without a re-read; read by status and code, never by text", async () => {
    const rows: [ApiResult<ListingRevisionChange>, string][] = [
      [http(409, "LISTING_ARCHIVED"), "The listing is archived."],
      [http(403, "FORBIDDEN"), "Only the lead's assigned Sale puts a revision live."],
      [http(404, "NOT_FOUND"), "This listing does not exist, or you cannot open it."],
      [http(400, "VALIDATION_FAILED", ["dataVersion"]), "Something went wrong. Try again."],
      [http(409, "SOMETHING_NEW", ["reasons.FRESHNESS"]), "Something went wrong. Try again."],
      [http(500, "INTERNAL_ERROR"), "Something went wrong. Try again."],
      [{ ok: false, kind: "network" }, "Something went wrong. Try again."],
    ];
    for (const [result, sentence] of rows) {
      const { outcome } = await outcomeOf(result);
      if (outcome.kind !== "sentence") throw new Error(`expected sentence, got ${outcome.kind}`);
      expect(t(outcome.sentence)).toBe(sentence);
      expect(outcome.reread).toBe(false);
    }
  });

  it("putLiveFlow_sessionAnswer_silent: a session answer shows nothing", async () => {
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingRevisionChange>[]) {
      const { outcome } = await outcomeOf(result);
      expect(outcome).toEqual({ kind: "silent" });
    }
  });
});
