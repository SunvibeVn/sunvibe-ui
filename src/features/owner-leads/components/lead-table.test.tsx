import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { LeadSummary } from "@/features/lead-shared";
import en from "@/i18n/messages/en.json";

import { type LeadSelection, selectable } from "../lib/lead-selection-state";

import { LeadTable } from "./lead-table";

// Pin of today's table (acquisition-owner-lead-bulk-assign M-17): the render "My Leads" uses, with no other prop.
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

const COLUMNS = en.OwnerLeads.list.columns;

function renderTable(leads: readonly LeadSummary[]) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <LeadTable leads={leads} />
    </NextIntlClientProvider>,
  );
}

describe("LeadTable", () => {
  it("shows the ten column headers in order", () => {
    renderTable([ASSIGNED, REJECTED]);

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual([
      COLUMNS.code,
      COLUMNS.owner,
      COLUMNS.ward,
      COLUMNS.requirement,
      COLUMNS.propertyType,
      COLUMNS.status,
      COLUMNS.created,
      COLUMNS.lastUpdate,
      COLUMNS.note,
      COLUMNS.action,
    ]);
  });

  it("shows each request code as the whole text of its first cell, and a View link to the lead", () => {
    renderTable([ASSIGNED, REJECTED]);

    const [, ...rows] = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    for (const [row, lead] of [
      [rows[0], ASSIGNED],
      [rows[1], REJECTED],
    ] as const) {
      const cells = within(row).getAllByRole("cell");
      expect(cells[0].textContent).toBe(lead.requestCode);
      const link = within(row).getByRole("link", { name: `View ${lead.requestCode}` });
      expect(link.getAttribute("href")).toBe(`/workspace/owner-leads/${lead.id}`);
    }
  });

  it("has no checkbox", () => {
    renderTable([ASSIGNED, REJECTED]);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

// "All Leads" passes a selection (acquisition-owner-lead-bulk-assign AC-14, D-7): a box in the CODE cell of each open row.
describe("LeadTable with a selection", () => {
  function renderSelectable(selected: LeadSelection, disabled = false) {
    const onToggle = vi.fn<(leadId: string) => void>();
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
        <LeadTable leads={[ASSIGNED, REJECTED]} selection={{ selected, onToggle, disabled }} />
      </NextIntlClientProvider>,
    );
    return onToggle;
  }

  it("puts a box named for the code in the CODE cell of the open row only", () => {
    renderSelectable([]);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0].getAttribute("aria-label")).toBe("Select SV-AAAA-0007");
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);

    const [, openRow, closedRow] = screen.getAllByRole("row");
    expect(within(openRow).getAllByRole("cell")[0].contains(boxes[0])).toBe(true);
    expect(within(closedRow).queryByRole("checkbox")).toBeNull();
  });

  it("keeps the ten headers and the code as the whole text of the CODE cell", () => {
    renderSelectable([]);

    expect(screen.getAllByRole("columnheader")).toHaveLength(10);
    expect(screen.getAllByRole("columnheader")[0].textContent).toBe(COLUMNS.code);
    const [, openRow] = screen.getAllByRole("row");
    expect(within(openRow).getAllByRole("cell")[0].textContent).toBe(ASSIGNED.requestCode);
  });

  it("shows the selected row checked and tells which row was clicked", () => {
    const onToggle = renderSelectable([selectable(ASSIGNED)!]);

    const box = screen.getByRole("checkbox", { name: "Select SV-AAAA-0007" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith(ASSIGNED.id);
  });

  it("disables the boxes while an assignment runs", () => {
    renderSelectable([], true);

    expect((screen.getByRole("checkbox", { name: "Select SV-AAAA-0007" }) as HTMLInputElement).disabled).toBe(true);
  });
});
