import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { agreementListRows } from "../lib/agreement-list-model";
import type { BrokerageAgreementListItem } from "../types";

import { AgreementList } from "./agreement-list";

const ACTIVE: BrokerageAgreementListItem = {
  agreementId: "01JF000000000000000000000A",
  unitCode: "P101",
  transactionType: "LONG_TERM_RENT",
  status: "ACTIVE",
  latestVersionNo: 2,
  latestVersionStatus: "ACTIVATED",
  createdAt: "2026-11-19T18:00:00Z",
  advertising: {
    allowed: false,
    reasonGroups: ["NOT_STARTED", "PROPERTY"],
    endDate: "2027-12-31",
    endsAt: "2027-12-31T17:00:00Z",
    startDate: "2027-01-01",
  },
};

const NO_CODE: BrokerageAgreementListItem = {
  agreementId: "01JF000000000000000000000B",
  unitCode: null,
  transactionType: "LONG_TERM_RENT",
  status: "ACTIVE",
  latestVersionNo: 1,
  latestVersionStatus: "EFFECTIVE",
  createdAt: "2026-11-01T03:00:00Z",
  advertising: { allowed: true, reasonGroups: [], endDate: "2027-12-31", endsAt: "2027-12-31T17:00:00Z", startDate: null },
};

/** The workspace layout's provider: English messages in Vietnam time (C-41). */
function renderList(items: BrokerageAgreementListItem[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementList rows={agreementListRows({ items, page: 0, size: 20, totalElements: items.length })} />
    </NextIntlClientProvider>,
  );
}

describe("AgreementList (brokerage-agreement E05-S7, spec section 6, UL-2)", () => {
  it("agreementList_row_linesAndLink: each row links its unit code to the agreement page and shows its state, version, advertising lines and creation date", () => {
    renderList([ACTIVE, NO_CODE]);

    const items = screen.getAllByRole("listitem").filter((item) => item.querySelector("a") !== null);
    expect(items).toHaveLength(2);
    const [first, second] = items as [HTMLElement, HTMLElement];

    const link = within(first).getByRole("link", { name: "P101" });
    expect(link.getAttribute("href")).toBe("/workspace/brokerage-agreements/01JF000000000000000000000A");
    expect(within(first).getByText("Active")).toBeTruthy();
    expect(within(first).getByText("Version 2: Activated")).toBeTruthy();
    expect(within(first).getByText("Sunvibe may not advertise this unit now:")).toBeTruthy();
    expect(within(first).getByText("Advertising starts on 1 Jan 2027.")).toBeTruthy();
    expect(within(first).getByText("Stopped for the whole property.")).toBeTruthy();
    // The day in Vietnam, not in UTC (2026-11-19T18:00Z is 20 Nov 01:00 in Vietnam).
    expect(within(first).getByText("Created Nov 20, 2026")).toBeTruthy();

    const unnamed = within(second).getByRole("link", { name: "A unit with no code" });
    expect(unnamed.getAttribute("href")).toBe("/workspace/brokerage-agreements/01JF000000000000000000000B");
    expect(within(second).getByText("Version 1: In effect")).toBeTruthy();
    expect(within(second).getByText("Sunvibe may advertise this unit until the end of 31 Dec 2027.")).toBeTruthy();
    expect(within(second).queryByText("Sunvibe may not advertise this unit now:")).toBeNull();
  });

  it("agreementList_allowedNoEnd_noEndLine: an allowed answer without an end date reads the no-end line; an item without a creation time shows no created line", () => {
    renderList([{ ...NO_CODE, createdAt: undefined, advertising: { allowed: true, reasonGroups: [], endDate: null } }]);

    expect(screen.getByText("Sunvibe may advertise this unit now.")).toBeTruthy();
    expect(screen.queryByText(/^Created /)).toBeNull();
  });
});
