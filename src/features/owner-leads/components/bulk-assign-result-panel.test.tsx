import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

import type { BulkAssignModel } from "../lib/bulk-assign-model";

import { BulkAssignResultPanel } from "./bulk-assign-result-panel";

function renderPanel(model: BulkAssignModel) {
  const onDismiss = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <BulkAssignResultPanel model={model} onDismiss={onDismiss} />
    </NextIntlClientProvider>,
  );
  return onDismiss;
}

describe("BulkAssignResultPanel (acquisition-owner-lead-bulk-assign AC-21)", () => {
  it("shows the totals, one line per lead with its code and outcome, and the retry hint", () => {
    renderPanel({
      lines: [
        { leadId: "L7", code: "SV-E2EA-0007", outcome: "ASSIGNED" },
        { leadId: "L9", code: "SV-E2EA-0009", outcome: "STALE" },
      ],
      totals: { assigned: 1, unchanged: 0, notAssigned: 1 },
      showRetryHint: true,
    });

    const region = screen.getByRole("region", { name: "Assignment result" });
    expect(within(region).getByText("1 assigned · 0 unchanged · 1 not assigned")).toBeTruthy();
    const lines = within(region).getAllByRole("listitem").map((line) => line.textContent);
    expect(lines).toEqual([
      "SV-E2EA-0007 Assigned",
      "SV-E2EA-0009 Not assigned: someone else just updated this lead",
    ]);
    expect(
      within(region).getByText("To try again, select the leads that were not assigned in the reloaded list."),
    ).toBeTruthy();
  });

  it("shows every outcome text, other as Not assigned, and no hint when nothing failed", () => {
    renderPanel({
      lines: [
        { leadId: "A", code: "SV-A", outcome: "ASSIGNED" },
        { leadId: "B", code: "SV-B", outcome: "ALREADY_ASSIGNED" },
      ],
      totals: { assigned: 1, unchanged: 1, notAssigned: 0 },
      showRetryHint: false,
    });

    expect(screen.getByText("1 assigned · 1 unchanged · 0 not assigned")).toBeTruthy();
    expect(screen.getByText("No change: already held by this person")).toBeTruthy();
    expect(screen.queryByText(/To try again/)).toBeNull();
  });

  it("names the closed, not found and unknown outcomes", () => {
    renderPanel({
      lines: [
        { leadId: "C", code: "SV-C", outcome: "CLOSED" },
        { leadId: "D", code: "SV-D", outcome: "NOT_FOUND" },
        { leadId: "E", code: "SV-E", outcome: "other" },
      ],
      totals: { assigned: 0, unchanged: 0, notAssigned: 3 },
      showRetryHint: true,
    });

    expect(screen.getByText("Not assigned: the lead is closed")).toBeTruthy();
    expect(screen.getByText("Not assigned: lead not found, or you can no longer see it")).toBeTruthy();
    expect(screen.getByText("Not assigned")).toBeTruthy();
  });

  it("takes the focus when it shows, and not again when its route is shown again", () => {
    const model: BulkAssignModel = { lines: [], totals: { assigned: 0, unchanged: 0, notAssigned: 0 }, showRetryHint: false };
    const view = (mode: "visible" | "hidden") => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
        <button type="button">Elsewhere</button>
        <Activity mode={mode}>
          <BulkAssignResultPanel model={model} onDismiss={() => undefined} />
        </Activity>
      </NextIntlClientProvider>
    );
    const { rerender } = render(view("visible"));
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Assignment result" }));

    // Next keeps a route left by a client-side navigation mounted but hidden, and runs its effects again when shown.
    rerender(view("hidden"));
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    rerender(view("visible"));

    expect(document.activeElement).toBe(elsewhere);
  });

  it("calls onDismiss on Dismiss", () => {
    const onDismiss = renderPanel({ lines: [], totals: { assigned: 0, unchanged: 0, notAssigned: 0 }, showRetryHint: false });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
