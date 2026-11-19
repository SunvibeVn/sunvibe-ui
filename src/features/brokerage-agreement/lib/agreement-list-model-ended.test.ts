import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementListItem } from "../types";

import { agreementListRows } from "./agreement-list-model";
import { phraseText, type Translate } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" }) as unknown as Translate;

const ITEM: BrokerageAgreementListItem = {
  agreementId: "01JF000000000000000000000A",
  unitCode: "P101",
  transactionType: "LONG_TERM_RENT",
  status: "EXPIRED",
  latestVersionNo: 2,
  latestVersionStatus: "EFFECTIVE",
  createdAt: "2026-11-20T03:15:00Z",
  advertising: { allowed: false, reasonGroups: ["ENDED"], endDate: "2027-12-31", endsAt: "2027-12-31T17:00:00Z", startDate: null },
};

/** The one row of `item`: its version line and its advertising lines, as text. */
function rowText(item: BrokerageAgreementListItem) {
  const [row] = agreementListRows({ items: [item], page: 0, size: 20, totalElements: 1 });
  if (row === undefined) throw new Error("no row");
  return {
    version: row.version === null ? null : t(row.version.statusKey),
    advertising: row.advertising.allowed ? [] : row.advertising.reasons.map((reason) => phraseText(t, reason)),
  };
}

describe("agreement list rows of ended agreements (brokerage-agreement E05-S8, S8-D16, E05S8-P11, UF-5)", () => {
  it("agreementListModel_endedRow_versionLineAndAdvertisingByStatus: an EFFECTIVE latest version of an EXPIRED or TERMINATED agreement reads Ended with the agreement; the ENDED line follows the row's state", () => {
    expect(rowText(ITEM)).toEqual({
      version: "Ended with the agreement",
      advertising: ["The agreement's period ended on 31 Dec 2027."],
    });
    expect(rowText({ ...ITEM, status: "TERMINATED" })).toEqual({
      version: "Ended with the agreement",
      advertising: ["The agreement has ended."],
    });
    expect(rowText({ ...ITEM, status: "TERMINATED", latestVersionStatus: "CANCELLED" })).toEqual({
      version: "Cancelled",
      advertising: ["The agreement has ended."],
    });
    expect(rowText({ ...ITEM, status: "CANCELLED", latestVersionStatus: "CANCELLED" }).advertising).toEqual([
      "The agreement has ended.",
    ]);
    // A row without a state reads its ENDED line as an unknown state.
    expect(rowText({ ...ITEM, status: undefined }).advertising).toEqual(["The agreement has ended."]);
    // Every other pair keeps today's texts.
    expect(rowText({ ...ITEM, status: "SUSPENDED" })).toEqual({
      version: "In effect",
      advertising: ["The agreement's period ended on 31 Dec 2027."],
    });
    expect(rowText({ ...ITEM, status: "ACTIVE" }).version).toBe("In effect");
  });
});
