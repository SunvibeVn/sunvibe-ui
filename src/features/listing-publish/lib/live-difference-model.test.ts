import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingLiveDifference, ListingLiveRevision } from "../types";

import { liveDifferenceModel } from "./live-difference-model";
import { phraseText } from "./revision-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LIVE: ListingLiveRevision = {
  revisionNo: 2,
  wentLiveAt: "2026-11-22T03:00:00Z",
  title: "Phòng trọ gần chợ",
  description: "Phòng rộng.\nGần chợ.",
  features: {
    furnishing: "BASIC",
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: null,
    balcony: false,
    elevator: false,
    motorbikeParking: false,
    carParking: false,
    internet: false,
    pets: null,
    noSharedLandlord: false,
  },
  terms: {
    source: "IN_EFFECT",
    pendingStartDate: null,
    capturedAt: "2026-11-21T02:00:00Z",
    terms: {
      monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
      deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
      minimumTermMonths: 6,
      paymentPeriodMonths: 1,
      mandatoryFees: [],
    },
  },
};

const ok = (data: ListingLiveDifference): ApiResult<ListingLiveDifference> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<ListingLiveDifference> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

describe("live difference model (listing-publish E06-S6, spec section 6, E06S6-D12)", () => {
  it("liveDifferenceModel_threeComparisons_kinds: loading before the answer; COMPARED with the live revision, NO_LIVE_REVISION and IS_LIVE_REVISION each their kind; COMPARED without a live revision is an error", () => {
    expect(liveDifferenceModel(null)).toEqual({ kind: "loading" });

    const compared = liveDifferenceModel(ok({ revisionNo: 3, comparison: "COMPARED", live: LIVE, changedParts: [] }));
    expect(compared).toEqual({ kind: "compared", liveRevisionNo: 2, wentLiveAt: "2026-11-22T03:00:00Z", changedPartKeys: [], values: [] });

    expect(liveDifferenceModel(ok({ revisionNo: 3, comparison: "NO_LIVE_REVISION", live: null, changedParts: [] }))).toEqual({ kind: "noLive" });
    expect(liveDifferenceModel(ok({ revisionNo: 2, comparison: "IS_LIVE_REVISION", live: null, changedParts: [] }))).toEqual({ kind: "isLive" });
    expect(liveDifferenceModel(ok({ revisionNo: 3, comparison: "COMPARED", live: null, changedParts: ["TITLE"] }))).toEqual({ kind: "error" });
    expect(liveDifferenceModel(ok({ revisionNo: 3, comparison: "SOMETHING_NEW" as never, live: null, changedParts: [] }))).toEqual({ kind: "error" });
  });

  it("liveDifferenceModel_changedParts_labelsInAnswerOrder: the changed parts' labels in the answer's order, an unknown part read as its fallback; the live value of each known changed part, in the same order", () => {
    const model = liveDifferenceModel(
      ok({ revisionNo: 3, comparison: "COMPARED", live: LIVE, changedParts: ["TERMS", "TITLE", "NEW_PART" as never, "FEATURES", "DESCRIPTION"] }),
    );
    if (model.kind !== "compared") throw new Error(`expected compared, got ${model.kind}`);
    expect(model.changedPartKeys.map((key) => t(key))).toEqual(["Terms", "Title", "Another part", "Features", "Description"]);
    expect(model.values.map((value) => value.part)).toEqual(["TERMS", "TITLE", "FEATURES", "DESCRIPTION"]);

    const [terms, title, features, description] = model.values;
    expect(title).toEqual({ part: "TITLE", text: "Phòng trọ gần chợ" });
    expect(description).toEqual({ part: "DESCRIPTION", text: "Phòng rộng.\nGần chợ." });
    if (features?.part !== "FEATURES" || terms?.part !== "TERMS") throw new Error("expected the features and the terms");
    expect(features.lines.map((line) => phraseText(t, line))).toEqual(["Furniture: Basic furniture", "Air conditioner"]);
    expect(terms.terms?.sourceKey).toBe("revision.terms.sources.IN_EFFECT");
    expect(terms.terms?.lines.map((line) => phraseText(t, line))).toEqual([
      "Rent: 4,500,000 VND / month",
      "Deposit: 2 months' rent",
      "Minimum term: 6 months",
      "Pay every month",
    ]);
  });

  it("liveDifferenceModel_notFoundOrSession_none: the one 404 and the session answers show nothing; a 403, a 500 and no answer are the error", () => {
    for (const result of [http(404, "NOT_FOUND"), { ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingLiveDifference>[]) {
      expect(liveDifferenceModel(result)).toEqual({ kind: "none" });
    }
    for (const result of [http(403, "FORBIDDEN"), http(500, "INTERNAL_ERROR"), { ok: false, kind: "network" }] as ApiResult<ListingLiveDifference>[]) {
      expect(liveDifferenceModel(result)).toEqual({ kind: "error" });
    }
  });
});
