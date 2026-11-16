import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { EMPTY_FEE_POLICY, type FeePolicyErrors, type FeePolicyValues } from "../lib/fee-policy-form";

import { FeePolicySection } from "./fee-policy-section";

const f = en.BrokerageAgreement.edit.feePolicy;

/** The section with its values in state, as the edit form holds them; `seen` gets every value it shows. */
function Harness({ errors = {}, rejected = false, seen }: { errors?: FeePolicyErrors; rejected?: boolean; seen?: (values: FeePolicyValues) => void }) {
  const [values, setValues] = useState<FeePolicyValues>(EMPTY_FEE_POLICY);
  seen?.(values);
  return <FeePolicySection values={values} onChange={setValues} errors={errors} rejected={rejected} />;
}

function renderSection(props: { errors?: FeePolicyErrors; rejected?: boolean } = {}) {
  let last: FeePolicyValues = EMPTY_FEE_POLICY;
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <Harness {...props} seen={(values) => (last = values)} />
    </NextIntlClientProvider>,
  );
  return { values: () => last };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const fields = (label: string) => screen.getAllByLabelText(label) as HTMLInputElement[];
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const optionTexts = (label: string) => Array.from(field(label).querySelectorAll("option")).map((option) => option.textContent);

describe("FeePolicySection (brokerage-agreement E05-S4, BR-7, S4-D14, UF-2)", () => {
  it("feePolicySection_render_statementsAndKinds: the fixed statements, the kinds of each part, the tier rows with the first start fixed at 1, and Add a tier up to five", () => {
    const { values } = renderSection();

    const section = screen.getByRole("group", { name: f.title });
    expect(within(section).getByText("Paid by the owner.")).toBeTruthy();
    expect(within(section).getByText("Charged when a lease is signed.")).toBeTruthy();
    expect(optionTexts(f.formula)).toEqual([
      "Not entered",
      "Percentage of one month's rent",
      "Fixed amount",
      "Free of charge",
    ]);
    expect(optionTexts(f.renewal)).toEqual(["Not entered", "No fee", "Percentage of one month's rent", "Fixed amount"]);
    expect(optionTexts(f.earlyLeaseEnd)).toEqual(["Not entered", "No refund", "Partial refund"]);
    for (const label of [f.dueDays, f.protectionDays]) expect(field(label).getAttribute("inputmode")).toBe("numeric");
    expect(screen.queryByLabelText(f.tierFrom)).toBeNull();

    type(field(f.formula), "PERCENT_OF_RENT");
    expect(fields(f.tierFrom)).toHaveLength(1);
    expect(fields(f.tierFrom)[0]?.readOnly).toBe(true);
    expect(fields(f.tierFrom)[0]?.value).toBe("1");
    expect(screen.queryByRole("button", { name: f.removeTier })).toBeNull();
    const add = () => screen.getByRole("button", { name: f.addTier }) as HTMLButtonElement;
    for (let count = 1; count < 5; count += 1) fireEvent.click(add());
    expect(fields(f.tierFrom)).toHaveLength(5);
    expect(fields(f.tierFrom).map((input) => input.readOnly)).toEqual([true, false, false, false, false]);
    expect(add().disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: f.removeTier })).toHaveLength(4);
    type(fields(f.tierPercent)[0] as HTMLInputElement, "50");
    type(fields(f.tierFrom)[1] as HTMLInputElement, "12");
    fireEvent.click(screen.getAllByRole("button", { name: f.removeTier })[1] as HTMLElement);
    expect(values().formula.tiers).toEqual([
      { fromMonths: "1", percent: "50" },
      { fromMonths: "12", percent: "" },
      { fromMonths: "", percent: "" },
      { fromMonths: "", percent: "" },
    ]);
    expect(add().disabled).toBe(false);

    type(field(f.formula), "FIXED_AMOUNT");
    expect(screen.queryByLabelText(f.tierFrom)).toBeNull();
    type(field(f.fixedAmount), "2000000");
    type(field(f.formula), "FREE");
    expect(screen.queryByLabelText(f.fixedAmount)).toBeNull();
    type(field(f.freeReason), "First unit with Sunvibe");
    expect(values().formula).toEqual({ kind: "FREE", tiers: [], amount: "", freeReason: "First unit with Sunvibe" });

    type(field(f.renewal), "PERCENT_OF_RENT");
    expect(fields(f.renewalTierFrom)[0]?.value).toBe("1");
    expect(screen.getByRole("button", { name: f.addRenewalTier })).toBeTruthy();
    type(field(f.renewal), "FIXED_AMOUNT");
    type(field(f.renewalAmount), "1000000");
    type(field(f.earlyLeaseEnd), "PARTIAL_REFUND");
    type(field(f.refundPercent), "50");
    type(field(f.withinMonths), "3");
    type(field(f.dueDays), "7");
    type(field(f.protectionDays), "90");
    expect(values()).toMatchObject({
      dueDays: "7",
      renewal: { kind: "FIXED_AMOUNT", amount: "1000000" },
      earlyLeaseEnd: { kind: "PARTIAL_REFUND", refundPercent: "50", withinMonths: "3" },
      protectionDays: "90",
    });
    expect(screen.queryByText(f.errors.server)).toBeNull();
  });

  it("feePolicySection_problemsAndServerRefusal_texts: a field's problem shows its text and marks it; a server refusal says to check the fee", () => {
    renderSection({ errors: { dueDays: "dueDays", protectionDays: "protectionDays" }, rejected: true });

    expect(screen.getByText(f.errors.server)).toBeTruthy();
    expect(screen.getByText(f.errors.dueDays)).toBeTruthy();
    expect(screen.getByText(f.errors.protectionDays)).toBeTruthy();
    expect(field(f.dueDays).getAttribute("aria-invalid")).toBe("true");
    expect(field(f.dueDays).getAttribute("aria-describedby")).toBeTruthy();
    expect(field(f.protectionDays).getAttribute("aria-invalid")).toBe("true");
  });
});
