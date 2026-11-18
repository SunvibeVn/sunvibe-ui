import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementListItem, BrokerageAgreementPage } from "../types";

import { advertisingReasonText } from "./advertising-text";
import { agreementListOutcome, agreementListRows, listAdvertisingAnswer } from "./agreement-list-model";
import { phraseText, type Translate } from "./version-terms-model";

// The real function, watched: the value the list model hands to it is the one the detail's input type holds (S7-D5).
vi.mock("./advertising-text", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./advertising-text")>();
  return { ...actual, advertisingReasonText: vi.fn(actual.advertisingReasonText) };
});

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" }) as unknown as Translate;

const ITEM: BrokerageAgreementListItem = {
  agreementId: "01JF000000000000000000000A",
  unitCode: "P101",
  transactionType: "LONG_TERM_RENT",
  status: "ACTIVE",
  latestVersionNo: 2,
  latestVersionStatus: "ACTIVATED",
  createdAt: "2026-11-20T03:15:00Z",
  advertising: {
    allowed: false,
    reasonGroups: ["NOT_STARTED"],
    endDate: "2027-12-31",
    endsAt: "2027-12-31T17:00:00Z",
    startDate: "2027-01-01",
  },
};

const pageOf = (...items: BrokerageAgreementListItem[]): BrokerageAgreementPage => ({
  items,
  page: 0,
  size: 20,
  totalElements: items.length,
});

/** The advertising lines of the one row of `item`, as text. */
function linesOf(item: BrokerageAgreementListItem): string[] {
  const [row] = agreementListRows(pageOf(item));
  if (row === undefined) throw new Error("no row");
  return row.advertising.allowed ? [] : row.advertising.reasons.map((reason) => phraseText(t, reason));
}

describe("agreement list rows (brokerage-agreement E05-S7, spec section 6, UL-2, UL-5)", () => {
  afterEach(() => {
    vi.mocked(advertisingReasonText).mockClear();
  });

  it("agreementListModel_row_unitCodeStateVersionAndLink: a row holds the unit code or null, the state and version texts, its creation time and the link to its agreement page", () => {
    const rows = agreementListRows(
      pageOf(ITEM, {
        ...ITEM,
        agreementId: "01JF000000000000000000000B",
        unitCode: null,
        status: "DRAFTING",
        latestVersionNo: 1,
        latestVersionStatus: "DRAFT",
      }),
    );

    expect(rows).toMatchObject([
      {
        agreementId: "01JF000000000000000000000A",
        href: "/workspace/brokerage-agreements/01JF000000000000000000000A",
        unitCode: "P101",
        statusKey: "status.ACTIVE",
        version: { number: 2, statusKey: "versionStatus.ACTIVATED" },
        createdAt: "2026-11-20T03:15:00Z",
      },
      {
        agreementId: "01JF000000000000000000000B",
        href: "/workspace/brokerage-agreements/01JF000000000000000000000B",
        unitCode: null,
        statusKey: "status.DRAFTING",
        version: { number: 1, statusKey: "versionStatus.DRAFT" },
        createdAt: "2026-11-20T03:15:00Z",
      },
    ]);
    expect(t(rows[0]!.statusKey)).toBe("Active");
    expect(t(rows[0]!.version!.statusKey)).toBe("Activated");
  });

  it("agreementListModel_row_unknownOrAbsentValues: an unknown state reads its other text, an item without a version number has no version line, one without an id is left out", () => {
    const rows = agreementListRows(
      pageOf(
        { ...ITEM, status: "NEW_STATE" as never, latestVersionNo: undefined, createdAt: undefined },
        { ...ITEM, agreementId: undefined },
      ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ statusKey: "status.OTHER", version: null, createdAt: null });
    expect(agreementListRows({})).toEqual([]);
  });

  it("agreementListModel_advertisingAnswer_startDateNoTermsNoConsent: the value handed to advertisingReasonText holds allowed, the groups, the end and pendingVersion.startDate, and never the terms or the photo consent", () => {
    agreementListRows(pageOf(ITEM));

    expect(vi.mocked(advertisingReasonText)).toHaveBeenCalledTimes(1);
    const [group, answer] = vi.mocked(advertisingReasonText).mock.calls[0]!;
    expect(group).toBe("NOT_STARTED");
    expect(answer).toStrictEqual({
      allowed: false,
      reasonGroups: ["NOT_STARTED"],
      endDate: "2027-12-31",
      endsAt: "2027-12-31T17:00:00Z",
      pendingVersion: { startDate: "2027-01-01" },
    });
    expect(Object.keys(answer)).not.toContain("termsInEffect");
    expect(Object.keys(answer)).not.toContain("photoConsent");

    expect(listAdvertisingAnswer({ ...ITEM.advertising, startDate: null })).toStrictEqual({
      allowed: false,
      reasonGroups: ["NOT_STARTED"],
      endDate: "2027-12-31",
      endsAt: "2027-12-31T17:00:00Z",
      pendingVersion: null,
    });
    expect(listAdvertisingAnswer({ ...ITEM.advertising, startDate: "" }).pendingVersion).toBeNull();
    expect(listAdvertisingAnswer(undefined)).toStrictEqual({ pendingVersion: null });
  });

  it("agreementListModel_advertisingLines_allowedOrOnePerGroup: allowed with or without its end date; not allowed, one line per group in the answer's order", () => {
    expect(linesOf(ITEM)).toEqual(["Advertising starts on 1 Jan 2027."]);
    expect(linesOf({ ...ITEM, advertising: { ...ITEM.advertising, startDate: null } })).toEqual([
      "Advertising has not started yet.",
    ]);
    expect(
      linesOf({
        ...ITEM,
        advertising: { allowed: false, reasonGroups: ["ENDED", "PROPERTY", "NEW_GROUP" as never], endDate: "2027-12-31" },
      }),
    ).toEqual(["The agreement's period ended on 31 Dec 2027.", "Stopped for the whole property.", "Another reason stops it."]);

    const [allowed] = agreementListRows(
      pageOf({ ...ITEM, advertising: { allowed: true, reasonGroups: [], endDate: "2027-12-31", startDate: null } }),
    );
    expect(allowed?.advertising).toEqual({ allowed: true, endDate: "2027-12-31" });
    const [noEnd] = agreementListRows(pageOf({ ...ITEM, advertising: { allowed: true, reasonGroups: [], endDate: null } }));
    expect(noEnd?.advertising).toEqual({ allowed: true, endDate: null });
  });

  it("agreementListModel_absentAllowed_notAllowed: an answer without allowed, or without the advertising part, reads as not allowed, and one without a group reads the one fallback line", () => {
    expect(linesOf({ ...ITEM, advertising: { reasonGroups: ["UNIT"] } })).toEqual(["Stopped for this unit."]);
    expect(linesOf({ ...ITEM, advertising: { allowed: false } })).toEqual(["Another reason stops it."]);
    expect(linesOf({ ...ITEM, advertising: {} })).toEqual(["Another reason stops it."]);
    expect(linesOf({ ...ITEM, advertising: undefined })).toEqual(["Another reason stops it."]);
    const [row] = agreementListRows(pageOf({ ...ITEM, advertising: { reasonGroups: [] } }));
    expect(row?.advertising.allowed).toBe(false);
  });

  it("agreementListModel_row_noPrivateKey: a row built from an item carrying extra keys holds none of them", () => {
    const item = {
      ...ITEM,
      termsInEffect: { rent: 1 },
      ownerUserId: "U-OWNER",
      fee: 100,
      advertising: { ...ITEM.advertising, photoConsent: { interior: true }, termsInEffect: { rent: 1 } },
    } as BrokerageAgreementListItem;

    const [row] = agreementListRows(pageOf(item));
    const text = JSON.stringify(row);

    expect(Object.keys(row!).sort()).toEqual(["advertising", "agreementId", "createdAt", "href", "statusKey", "unitCode", "version"]);
    for (const key of ["termsInEffect", "ownerUserId", "fee", "photoConsent", "U-OWNER"]) expect(text).not.toContain(key);
    const [, answer] = vi.mocked(advertisingReasonText).mock.calls[0]!;
    expect(Object.keys(answer).sort()).toEqual(["allowed", "endDate", "endsAt", "pendingVersion", "reasonGroups"]);
  });

  it("agreementListModel_outcome_pageSessionOrFailed: 200 gives the page; signed out or unavailable the session; any other failure the error with the support code of an http answer", () => {
    const page = pageOf(ITEM);
    const ok: ApiResult<BrokerageAgreementPage> = { ok: true, data: page, status: 200, replayed: false };

    expect(agreementListOutcome(ok)).toEqual({ kind: "page", page });
    expect(agreementListOutcome({ ok: false, kind: "signed-out" })).toEqual({ kind: "error", error: { kind: "session" } });
    expect(agreementListOutcome({ ok: false, kind: "unavailable" })).toEqual({ kind: "error", error: { kind: "session" } });
    expect(agreementListOutcome({ ok: false, kind: "network" })).toEqual({ kind: "error", error: { kind: "failed" } });
    expect(
      agreementListOutcome({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [], correlationId: "c-1" }),
    ).toEqual({ kind: "error", error: { kind: "failed", correlationId: "c-1" } });
    expect(agreementListOutcome({ ok: false, kind: "http", status: 403, fieldErrors: [] })).toEqual({
      kind: "error",
      error: { kind: "failed" },
    });
  });
});
