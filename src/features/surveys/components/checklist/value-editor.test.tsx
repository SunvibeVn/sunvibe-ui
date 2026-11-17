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

  it("reads 4.25 x 8.1 = 34.425 as 34.425 m2, never as 34425 (a dot or comma is a decimal point in an area)", () => {
    expect(reported({ kind: "area" }, "34.425")).toEqual([34.425]);
    expect(reported({ kind: "area" }, "34,425")).toEqual([34.425]);
  });

  it("does not group thousands in a whole-number cell: 1.000 is not a valid count", () => {
    expect(reported({ kind: "integer", min: 0, max: 50 }, "1.000")).toEqual([null]);
    expect(reported({ kind: "integer", min: 0, max: 50 }, "12")).toEqual([12]);
  });
});
