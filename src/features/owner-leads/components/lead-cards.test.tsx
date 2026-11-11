import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import type { LeadSummary } from "@/features/lead-shared";
import en from "@/i18n/messages/en.json";

import { LeadCards } from "./lead-cards";

// Pin of today's cards (acquisition-owner-lead-bulk-assign M-18): the render "My Leads" uses, with no other prop.
const ASSIGNED: LeadSummary = {
  id: "01JE2EHEAD0000000000000007",
  requestCode: "SV-AAAA-0007",
  contactName: "Nguyen Van A",
  wardName: "Hải Châu",
  intent: "SALE",
  propertyType: "HOUSE",
  status: "ASSIGNED",
  createdAt: "2026-11-01T02:00:00Z",
  lastActivityAt: "2026-11-02T03:00:00Z",
  version: 1,
  assignedUserId: "u-sale",
};

const REJECTED: LeadSummary = {
  id: "01JE2EHEAD0000000000000011",
  requestCode: "SV-AAAA-0011",
  contactName: "Tran Thi B",
  wardName: "Sơn Trà",
  intent: "LONG_TERM_RENT",
  propertyType: "VILLA",
  status: "REJECTED",
  createdAt: "2026-11-03T02:00:00Z",
  lastActivityAt: "2026-11-04T03:00:00Z",
  version: 3,
  assignedUserId: null,
};

function renderCards(leads: readonly LeadSummary[]) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <LeadCards leads={leads} />
    </NextIntlClientProvider>,
  );
}

describe("LeadCards", () => {
  it("shows one card per lead with its code, its status label and a View link to the lead", () => {
    renderCards([ASSIGNED, REJECTED]);

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    for (const [card, lead, status] of [
      [cards[0], ASSIGNED, en.OwnerLeads.status.ASSIGNED],
      [cards[1], REJECTED, en.OwnerLeads.status.REJECTED],
    ] as const) {
      expect(within(card).getByText(lead.requestCode ?? "")).toBeTruthy();
      expect(within(card).getByText(status)).toBeTruthy();
      const link = within(card).getByRole("link", { name: `View ${lead.requestCode}` });
      expect(link.getAttribute("href")).toBe(`/workspace/owner-leads/${lead.id}`);
    }
  });

  it("has no checkbox", () => {
    renderCards([ASSIGNED, REJECTED]);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
