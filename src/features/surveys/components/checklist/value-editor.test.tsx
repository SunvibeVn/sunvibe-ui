import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

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
