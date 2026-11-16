import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { feePolicyModel } from "../lib/fee-policy-model";
import type { BrokerageAgreementFeePolicy } from "../types";

import { FeePolicyPanel } from "./fee-policy-panel";

/** The fee policy of spec section 4's example. */
const FULL: BrokerageAgreementFeePolicy = {
  payer: "OWNER",
  chargedWhen: "LEASE_SIGNED",
  formula: {
    type: "PERCENT_OF_RENT",
    tiers: [
      { fromMonths: 1, percent: 50 },
      { fromMonths: 12, percent: 100 },
    ],
    amount: null,
    currency: null,
    freeReason: null,
  },
  dueDays: 7,
  renewal: { type: "NOT_CHARGED", tiers: [], amount: null, currency: null, freeReason: null },
  earlyLeaseEnd: { type: "PARTIAL_REFUND", refundPercent: 50, withinMonths: 3 },
  protectionDays: 90,
};

function renderPanel(feePolicy: BrokerageAgreementFeePolicy | undefined, proposed: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <FeePolicyPanel view={feePolicyModel(feePolicy, proposed)} />
    </NextIntlClientProvider>,
  );
}

/** The `<dd>` beside the `<dt>` whose text is `label`. */
const valueOf = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;

describe("FeePolicyPanel (brokerage-agreement E05-S4, BR-7, S4-D14, UF-1, UF-7)", () => {
  it("feePolicyPanel_fullPolicy_linesAndNoButton: the title, the two statements and every part of the fee policy, with no action", () => {
    renderPanel(FULL, false);

    expect(screen.getByRole("heading", { level: 4, name: "Brokerage fee" })).toBeTruthy();
    expect(valueOf("Who pays").textContent).toBe("The owner");
    expect(valueOf("When it is charged").textContent).toBe("When a lease is signed");
    expect(Array.from(valueOf("Fee").querySelectorAll("li")).map((line) => line.textContent)).toEqual([
      "From a lease term of 1 month: 50% of one month's rent",
      "From a lease term of 12 months: 100% of one month's rent",
    ]);
    expect(valueOf("Payment due").textContent).toBe("7 days after the lease is signed");
    expect(valueOf("Lease renewed with the same tenant").textContent).toBe("No fee");
    expect(valueOf("If the lease ends early").textContent).toBe(
      "50% of the fee paid is refunded if the lease ends within 3 months of its start",
    );
    expect(valueOf("Protection period").textContent).toBe("90 days after this agreement ends");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("feePolicyPanel_notEntered_eachPartSaysSo: an answer without a fee policy reads each part not entered yet", () => {
    renderPanel(undefined, false);

    for (const label of ["Fee", "Payment due", "Lease renewed with the same tenant", "If the lease ends early", "Protection period"]) {
      expect(valueOf(label).textContent).toBe("Not entered yet");
    }
    expect(valueOf("Who pays").textContent).toBe("The owner");
  });

  it("feePolicyPanel_proposed_lineOnce: the proposed line shows once for a version the owner has not answered, never otherwise", () => {
    const proposed = renderPanel(FULL, true);
    expect(screen.getAllByText("Proposed fee policy: not confirmed by the owner yet.")).toHaveLength(1);
    proposed.unmount();

    renderPanel(FULL, false);
    expect(screen.queryByText("Proposed fee policy: not confirmed by the owner yet.")).toBeNull();
  });
});
