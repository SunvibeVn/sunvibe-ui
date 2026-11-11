import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

import { BulkAssignPanel } from "./bulk-assign-panel";

type Check = "checked" | "mixed" | "unchecked";

function renderPanel(check: Check, count: number, busy = false) {
  const props = { check, count, busy, onToggleAll: vi.fn(), onAssign: vi.fn(), onClear: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <BulkAssignPanel {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const selectAll = (): HTMLInputElement =>
  screen.getByRole("checkbox", { name: "Select all open leads on this page" }) as HTMLInputElement;
const button = (name: string): HTMLButtonElement => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("BulkAssignPanel (acquisition-owner-lead-bulk-assign AC-15)", () => {
  it("shows an unchecked select-all and no count or buttons when nothing is selected", () => {
    renderPanel("unchecked", 0);

    expect(selectAll().checked).toBe(false);
    expect(selectAll().indeterminate).toBe(false);
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the mixed state, the count and both buttons when some rows are selected", () => {
    renderPanel("mixed", 2);

    expect(selectAll().checked).toBe(false);
    expect(selectAll().indeterminate).toBe(true);
    expect(screen.getByText("2 leads selected")).toBeTruthy();
    expect(button("Assign selected").disabled).toBe(false);
    expect(button("Clear selection").disabled).toBe(false);
  });

  it("shows a checked select-all when every row is selected", () => {
    renderPanel("checked", 1);

    expect(selectAll().checked).toBe(true);
    expect(selectAll().indeterminate).toBe(false);
    expect(screen.getByText("1 lead selected")).toBeTruthy();
  });

  it("calls its handlers", () => {
    const props = renderPanel("mixed", 2);

    fireEvent.click(selectAll());
    fireEvent.click(button("Assign selected"));
    fireEvent.click(button("Clear selection"));

    expect(props.onToggleAll).toHaveBeenCalledTimes(1);
    expect(props.onAssign).toHaveBeenCalledTimes(1);
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("disables every control while an assignment runs (D-12)", () => {
    const props = renderPanel("mixed", 2, true);

    expect(selectAll().disabled).toBe(true);
    expect(button("Assign selected").disabled).toBe(true);
    expect(button("Clear selection").disabled).toBe(true);

    fireEvent.click(button("Assign selected"));
    expect(props.onAssign).not.toHaveBeenCalled();
  });
});
