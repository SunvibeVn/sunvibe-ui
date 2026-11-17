import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

import type { ChecklistProblem } from "../../schemas/checklist";

import { type ValueKind, ValueEditor } from "./value-editor";

/** What the editor reports after `typed` is entered in an empty field of this kind. */
function reported(kind: ValueKind, typed: string): unknown[] {
  const onChange = vi.fn();
  const { unmount } = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ValueEditor id="f" label="Field" kind={kind} value={null} onChange={onChange} problems={{}} />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: typed } });
  unmount();
  return onChange.mock.calls.map((call) => call[0]);
}

describe("ValueEditor numbers (survey-checklist SV-247)", () => {
  it("reads a rent typed with thousands separators as the whole amount", () => {
    expect(reported({ kind: "rent" }, "1.500.000")).toEqual([{ amount: 1500000, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "1,500,000")).toEqual([{ amount: 1500000, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "8000000")).toEqual([{ amount: 8000000, currency: "VND", unit: "MONTH" }]);
  });

  it("reads an area with a dot or a comma and one decimal as a decimal", () => {
    expect(reported({ kind: "area" }, "34.4")).toEqual([34.4]);
    expect(reported({ kind: "area" }, "34,4")).toEqual([34.4]);
    expect(reported({ kind: "area" }, "34")).toEqual([34]);
  });

  it("reports no value for text that is not a number", () => {
    expect(reported({ kind: "area" }, "abc")).toEqual([null]);
  });

  it("reports no value for 4.25 x 8.1 = 34.425: a dot or comma is a decimal point in an area and it has one decimal", () => {
    expect(reported({ kind: "area" }, "34.425")).toEqual([null]);
    expect(reported({ kind: "area" }, "34,425")).toEqual([null]);
  });

  it("never reads a thousands-grouped area as 1000 times too small: 1.200, 1,200 and 34.400 report no value", () => {
    expect(reported({ kind: "area" }, "1.200")).toEqual([null]);
    expect(reported({ kind: "area" }, "1,200")).toEqual([null]);
    expect(reported({ kind: "area" }, "34.400")).toEqual([null]);
  });

  it("still reads whole and one-decimal areas", () => {
    expect(reported({ kind: "area" }, "1200")).toEqual([1200]);
    expect(reported({ kind: "area" }, "1.2")).toEqual([1.2]);
    expect(reported({ kind: "area" }, "34.4")).toEqual([34.4]);
  });

  it("reports no value for a money amount that is not whole digits or groups of three (SV-176 rule)", () => {
    expect(reported({ kind: "rent" }, "0,500")).toEqual([{ amount: null, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "12.000,000")).toEqual([{ amount: null, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "12,5")).toEqual([{ amount: null, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "012.000")).toEqual([{ amount: null, currency: "VND", unit: "MONTH" }]);
  });

  it("still reads well-formed money: 1.500, 12 000 000, 800000", () => {
    expect(reported({ kind: "rent" }, "1.500")).toEqual([{ amount: 1500, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "12 000 000")).toEqual([{ amount: 12000000, currency: "VND", unit: "MONTH" }]);
    expect(reported({ kind: "rent" }, "800000")).toEqual([{ amount: 800000, currency: "VND", unit: "MONTH" }]);
  });

  it("does not group thousands in a whole-number cell: 1.000 is not a valid count", () => {
    expect(reported({ kind: "integer", min: 0, max: 50 }, "1.000")).toEqual([null]);
    expect(reported({ kind: "integer", min: 0, max: 50 }, "12")).toEqual([12]);
  });
});

/** The text a box shows. */
const shownIn = (element: HTMLElement) => (element as HTMLInputElement).value;

/** The editor with its value held and passed back, as the field control does. */
function Held({ kind, problems = {} }: { kind: ValueKind; problems?: Readonly<Record<string, ChecklistProblem>> }) {
  const [value, setValue] = useState<unknown>(null);
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ValueEditor id="f" label="Field" kind={kind} value={value} onChange={setValue} problems={problems} />
    </NextIntlClientProvider>
  );
}

/** The editor with a value set from outside and a mock onChange that never feeds it back. */
function Outside({ kind, value, onChange }: { kind: ValueKind; value: unknown; onChange(value: unknown): void }) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ValueEditor id="f" label="Field" kind={kind} value={value} onChange={onChange} problems={{}} />
    </NextIntlClientProvider>
  );
}

describe("ValueEditor shown text (survey-checklist SV-247 pin)", () => {
  it("numberCell_outsideValue_replacesTypedText", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Outside kind={{ kind: "area" }} value={null} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "34.425" } });
    expect(shownIn(screen.getByRole("textbox"))).toBe("34.425");
    rerender(<Outside kind={{ kind: "area" }} value={50} onChange={onChange} />);
    expect(shownIn(screen.getByRole("textbox"))).toBe("50");
  });

  it("rentCell_ownerFormValue_replacesTypedAmount", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Outside kind={{ kind: "rent" }} value={null} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0,500" } });
    expect(shownIn(screen.getByRole("textbox"))).toBe("0,500");
    rerender(<Outside kind={{ kind: "rent" }} value={{ amount: 14000000, currency: "VND", unit: "MONTH" }} onChange={onChange} />);
    expect(shownIn(screen.getByRole("textbox"))).toBe("14000000");
  });

  it("numberCell_typedText_keptWhileReadOrNotRead", () => {
    const area = render(<Held kind={{ kind: "area" }} />);
    for (const typed of ["36", "34,4", "34.425"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: typed } });
      expect(shownIn(screen.getByRole("textbox"))).toBe(typed);
    }
    area.unmount();
    render(<Held kind={{ kind: "rent" }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1.500.000" } });
    expect(shownIn(screen.getByRole("textbox"))).toBe("1.500.000");
  });

  // survey-checklist SV-247 pin of today's behaviour: the fee rows are keyed by their index (spec risk R-4, kept by
  // [DEL-8] SV247-D5), so a typed text that did not read stays on the mounted row after a fee above it is removed.
  // A fix of the fee rows' identity changes this test on purpose.
  it("feeRows_removedFee_mountedRowKeepsTextNotRead", () => {
    const onChange = vi.fn();
    const fees = { kind: "fees" } as const;
    const first = render(
      <Outside
        kind={fees}
        value={[
          { name: "A", amount: null, chargeUnit: null },
          { name: "B", amount: null, chargeUnit: null },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("Amount (VND)")[0], { target: { value: "0,500" } });
    expect(shownIn(screen.getAllByLabelText("Amount (VND)")[0])).toBe("0,500");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([{ name: "B", amount: null, chargeUnit: null }]);
    first.rerender(<Outside kind={fees} value={[{ name: "B", amount: null, chargeUnit: null }]} onChange={onChange} />);
    expect(screen.getAllByLabelText("Amount (VND)")).toHaveLength(1);
    expect(shownIn(screen.getByRole("textbox", { name: "Fee" }))).toBe("B");
    expect(shownIn(screen.getByLabelText("Amount (VND)"))).toBe("0,500");
    first.unmount();

    const priced = { name: "B", amount: { amount: 2000000, currency: "VND" }, chargeUnit: null };
    const second = render(<Outside kind={fees} value={[{ name: "A", amount: null, chargeUnit: null }, priced]} onChange={onChange} />);
    fireEvent.change(screen.getAllByLabelText("Amount (VND)")[0], { target: { value: "0,500" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    second.rerender(<Outside kind={fees} value={[priced]} onChange={onChange} />);
    expect(shownIn(screen.getByLabelText("Amount (VND)"))).toBe("2000000");
  });
});

/** What the editor reports after `typed` is entered in the "Amount (VND)" box of an editor holding `value`. */
function reportedAt(kind: ValueKind, value: unknown, typed: string): unknown[] {
  const onChange = vi.fn();
  const { unmount } = render(<Outside kind={kind} value={value} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Amount (VND)"), { target: { value: typed } });
  unmount();
  return onChange.mock.calls.map((call) => call[0]);
}

describe("ValueEditor nested money cells (survey-checklist SV-247)", () => {
  // survey-checklist SV-247: the deposit, charge and fee amounts read by the owner-leads SV-176 whole-amount rule.
  it("nestedMoney_sv176Rule_readOrRefused", () => {
    const deposit = { basis: "AMOUNT", months: null, amount: null };
    expect(reportedAt({ kind: "deposit" }, deposit, "1.500.000")).toEqual([{ ...deposit, amount: { amount: 1500000, currency: "VND" } }]);
    expect(reportedAt({ kind: "deposit" }, deposit, "0,500")).toEqual([deposit]);
    expect(reportedAt({ kind: "deposit" }, deposit, "12.000,000")).toEqual([deposit]);

    const charge = { basis: "AMOUNT", amount: null, chargeUnit: null, note: null };
    expect(reportedAt({ kind: "charge" }, charge, "3.500")).toEqual([{ ...charge, amount: { amount: 3500, currency: "VND" } }]);
    expect(reportedAt({ kind: "charge" }, charge, "0,500")).toEqual([charge]);

    const fees = [{ name: "", amount: null, chargeUnit: null }];
    expect(reportedAt({ kind: "fees" }, fees, "12 000")).toEqual([[{ name: "", amount: { amount: 12000, currency: "VND" }, chargeUnit: null }]]);
    expect(reportedAt({ kind: "fees" }, fees, "12.000,000")).toEqual([fees]);
  });
});

describe("ValueEditor text that did not read (survey-checklist SV-247)", () => {
  const INVALID = "Enter a valid value.";
  const REQUIRED = "Fill in this field.";

  // survey-checklist SV-247: a number cell whose text did not read says so once the user leaves it.
  it("numberCell_leftWithTextNotRead_saysInvalid", () => {
    const area = render(<Held kind={{ kind: "area" }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "34.425" } });
    expect(screen.queryByText(INVALID)).toBeNull();
    fireEvent.blur(screen.getByRole("textbox"));
    expect(screen.getByText(INVALID)).toBeTruthy();
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "34.4" } });
    expect(screen.queryByText(INVALID)).toBeNull();
    area.unmount();

    render(<Held kind={{ kind: "rent" }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0,500" } });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(screen.getByText(INVALID)).toBeTruthy();
  });

  // survey-checklist SV-247: a save problem on a cell whose text did not read names the text, not a missing value.
  it("numberCell_saveProblemOnTextNotRead_saysInvalid", () => {
    const typed = render(<Held kind={{ kind: "area" }} problems={{ "": "required" }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "34.425" } });
    expect(screen.getByText(INVALID)).toBeTruthy();
    expect(screen.queryByText(REQUIRED)).toBeNull();
    typed.unmount();

    render(<Held kind={{ kind: "area" }} problems={{ "": "required" }} />);
    expect(screen.getByText(REQUIRED)).toBeTruthy();
  });

  // survey-checklist SV-247: a number set from outside the cell replaces the text and its message.
  it("numberCell_outsideValue_removesMessage", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Outside kind={{ kind: "area" }} value={null} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "34.425" } });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(screen.getByText(INVALID)).toBeTruthy();
    rerender(<Outside kind={{ kind: "area" }} value={50} onChange={onChange} />);
    expect(screen.queryByText(INVALID)).toBeNull();
  });
});
