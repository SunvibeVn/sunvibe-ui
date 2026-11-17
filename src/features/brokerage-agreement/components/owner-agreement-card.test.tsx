import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import { type OwnerAgreementModel, ownerAgreementsModel } from "../lib/owner-agreements-model";
import type { BrokerageAgreementOwnerItem, BrokerageAgreementVersion } from "../types";

import { OwnerAgreementCard } from "./owner-agreement-card";

const o = en.BrokerageAgreement.owner;
const STATEMENT_TEXT =
  "Version 1 of the brokerage agreement for unit P101: I have read every term above. Sunvibe may advertise this unit on Sunvibe's own channels under these terms and for this period.";

const SENT_V1: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "AWAITING_OWNER",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  advertisingScope: "SUNVIBE_CHANNELS",
  photoConsent: true,
  exteriorPhotoConsent: false,
  terms: {
    monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
    deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
    minimumTermMonths: 12,
    paymentPeriodMonths: 1,
    mandatoryFees: [],
  },
  feePolicy: {
    payer: "OWNER",
    chargedWhen: "LEASE_SIGNED",
    formula: { type: "FIXED_AMOUNT", tiers: [], amount: 2000000, currency: "VND", freeReason: null },
    dueDays: 0,
    renewal: { type: "NOT_CHARGED", tiers: [], amount: null, currency: null, freeReason: null },
    earlyLeaseEnd: { type: "NO_REFUND", refundPercent: null, withinMonths: null },
    protectionDays: 90,
  },
  sentAt: "2026-11-17T03:15:00.123456Z",
  answerBy: "2026-11-24T03:15:00.123456Z",
  ownerAnsweredAt: null,
  ownerRejectionReason: null,
};

const ITEM: BrokerageAgreementOwnerItem = {
  agreementId: "A1",
  status: "AWAITING_CONFIRMATION",
  transactionType: "LONG_TERM_RENT",
  unitCode: "P101",
  unitLocation: "P101 · Tower A, floor 10",
  street: "12 Example Street",
  wardName: "Ward 1",
  versions: [SENT_V1],
  statement: { version: "brokerage-agreement-2026-11", text: STATEMENT_TEXT },
};

function modelOf(item: BrokerageAgreementOwnerItem): OwnerAgreementModel {
  const model = ownerAgreementsModel({ ok: true, status: 200, replayed: false, data: { items: [item], more: false } });
  if (model.kind !== "list" || model.items[0] === undefined) throw new Error("expected one agreement");
  return model.items[0];
}

function renderCard(item: BrokerageAgreementOwnerItem, extra: { tickedVersions?: number[]; canTickMore?: boolean } = {}) {
  const props = { onTick: vi.fn(), onDecline: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ul>
        <OwnerAgreementCard
          agreement={modelOf(item)}
          tickedVersions={extra.tickedVersions ?? []}
          canTickMore={extra.canTickMore ?? true}
          {...props}
        />
      </ul>
    </NextIntlClientProvider>,
  );
  return props;
}

const tickBox = (versionNo: number) =>
  screen.queryByRole("checkbox", { name: `I have read version ${versionNo} and confirm it` }) as HTMLInputElement | null;

describe("OwnerAgreementCard (brokerage-agreement E05-S5, S5-D17, UO-1)", () => {
  it("ownerAgreementCard_render_unitLocationVersionsAndPanels: the unit, its location, the type, each sent version with its period and both read-only panels, and no proposed line", () => {
    renderCard(ITEM);

    expect(screen.getByRole("heading", { name: "Unit P101" })).toBeTruthy();
    for (const line of ["P101 · Tower A, floor 10", "12 Example Street", "Ward 1", "Long-term rental"]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "Version 1" })).toBeTruthy();
    expect(screen.getByText("Waiting for your answer until 2026-11-24 10:15")).toBeTruthy();
    expect(screen.getByText("1 Jan 2027")).toBeTruthy();
    expect(screen.getByText("31 Dec 2027")).toBeTruthy();
    // The terms panel and the fee panel of E05-S3 and E05-S4.
    expect(screen.getByText("8,000,000 VND per month")).toBeTruthy();
    expect(screen.getByText("2 months' rent")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Brokerage fee" })).toBeTruthy();
    expect(screen.getByText("2,000,000 VND per signed lease")).toBeTruthy();
    expect(screen.queryByText(en.BrokerageAgreement.terms.proposed)).toBeNull();
    expect(screen.queryByText(en.BrokerageAgreement.fee.proposed)).toBeNull();
  });

  it("ownerAgreementCard_answerable_statementBoxAndDecline: the version waiting for the answer shows the statement, its box and Decline", () => {
    const props = renderCard(ITEM);

    expect(screen.getByText(STATEMENT_TEXT)).toBeTruthy();
    const box = tickBox(1);
    expect(box?.checked).toBe(false);
    expect(box?.disabled).toBe(false);
    fireEvent.click(box as HTMLInputElement);
    expect(props.onTick).toHaveBeenCalledWith(1, true);

    fireEvent.click(screen.getByRole("button", { name: o.decline }));
    expect(props.onDecline).toHaveBeenCalledWith(1);
  });

  it("ownerAgreementCard_tickLimit_boxDisabledUnlessTicked: with 20 ticked elsewhere the box is disabled, a ticked box can still be unticked", () => {
    renderCard(ITEM, { canTickMore: false });
    expect(tickBox(1)?.disabled).toBe(true);
  });

  it("ownerAgreementCard_ticked_uncheckReportsIt: a ticked box shows checked and unticking reports it", () => {
    const props = renderCard(ITEM, { tickedVersions: [1], canTickMore: false });
    const box = tickBox(1) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(props.onTick).toHaveBeenCalledWith(1, false);
  });

  it("ownerAgreementCard_answered_stateTextNoControls: each answered or ended version reads its owner state text, with no statement, box or Decline", () => {
    const cases: [BrokerageAgreementVersion, string[]][] = [
      [{ ...SENT_V1, status: "OWNER_CONFIRMED", ownerAnsweredAt: "2026-11-18T01:00:00Z" }, ["You confirmed it on 2026-11-18 08:00"]],
      [
        { ...SENT_V1, status: "OWNER_REJECTED", ownerAnsweredAt: "2026-11-18T01:00:00Z", ownerRejectionReason: "The rent is too low." },
        ["You declined it on 2026-11-18 08:00", "Your reason: The rent is too low."],
      ],
      [{ ...SENT_V1, status: "LAPSED" }, ["No answer by 2026-11-24 10:15"]],
      [{ ...SENT_V1, status: "CANCELLED" }, ["Withdrawn by Sunvibe"]],
      [{ ...SENT_V1, status: "ACTIVATED" }, ["Sunvibe is handling this version."]],
    ];
    for (const [version, texts] of cases) {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
          <ul>
            <OwnerAgreementCard
              agreement={modelOf({ ...ITEM, versions: [version], statement: null })}
              tickedVersions={[]}
              canTickMore
              onTick={vi.fn()}
              onDecline={vi.fn()}
            />
          </ul>
        </NextIntlClientProvider>,
      );
      // The card is the first list item; its versions follow inside it.
      const card = screen.getAllByRole("listitem")[0] as HTMLElement;
      for (const text of texts) expect(within(card).getByText(text)).toBeTruthy();
      expect(within(card).queryByText(STATEMENT_TEXT)).toBeNull();
      expect(within(card).queryByRole("checkbox")).toBeNull();
      expect(within(card).queryByRole("button", { name: o.decline })).toBeNull();
      unmount();
    }
  });
});
