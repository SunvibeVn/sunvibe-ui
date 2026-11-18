import { render, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { agreementAfter, type VersionRow } from "../lib/agreement-model";
import type { BrokerageAgreementDetail } from "../types";

import { AgreementVersionList } from "./agreement-version-list";

type Version = NonNullable<BrokerageAgreementDetail["versions"]>[number];

const PERIOD = { startDate: "2027-01-01", endDate: "2027-12-31", createdAt: "2026-11-20T03:15:00Z" } as const;

/** A draft, a version waiting for the owner, one the owner declined with a reason and one with no answer in 7 days. */
const VERSIONS: Version[] = [
  { versionNo: 1, status: "DRAFT", ...PERIOD },
  {
    versionNo: 2,
    status: "AWAITING_OWNER",
    ...PERIOD,
    sentAt: "2026-11-21T03:15:00Z",
    answerBy: "2026-11-28T03:15:00Z",
  },
  {
    versionNo: 3,
    status: "OWNER_REJECTED",
    ...PERIOD,
    sentAt: "2026-11-21T03:15:00Z",
    answerBy: "2026-11-28T03:15:00Z",
    ownerAnsweredAt: "2026-11-22T03:15:00Z",
    ownerRejectionReason: "The rent is too low.",
  },
  {
    versionNo: 4,
    status: "LAPSED",
    ...PERIOD,
    sentAt: "2026-11-21T03:15:00Z",
    answerBy: "2026-11-28T03:15:00Z",
  },
];

const DETAIL: BrokerageAgreementDetail = {
  agreementId: "A1",
  status: "DRAFTING",
  transactionType: "LONG_TERM_RENT",
  unitId: "U1",
  unitCode: "P101",
  basisLeadId: "L1",
  createdAt: "2026-11-20T03:15:00Z",
  versions: VERSIONS,
};

function rowsOf(detail: BrokerageAgreementDetail): VersionRow[] {
  const model = agreementAfter({ ok: true, status: 200, replayed: false, data: detail });
  if (model.kind !== "ready") throw new Error(`expected a ready model, got ${model.kind}`);
  return model.versions;
}

/** Renders the list with the page's provider and answers its top-level items, one per version. */
function renderList(versions: VersionRow[]): HTMLElement[] {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementVersionList versions={versions} />
    </NextIntlClientProvider>,
  );
  return Array.from(container.querySelectorAll<HTMLElement>(":scope > ul > li"));
}

const ANSWER_LINE = /^(The owner may answer until|Confirmed by the owner on|Rejected by the owner on|No answer by) /;
const ANSWER_LINE_WITH_LAPSES = /^(No answer by|Not activated by) /;

describe("AgreementVersionList, the lines of today (brokerage-agreement E05-S6 pin, U-23)", () => {
  it("agreementVersionList_todayLines_statusSentAndAnswer: each version shows its heading, its state, when it was sent and the owner's answer line as today", () => {
    const rows = renderList(rowsOf(DETAIL));
    expect(rows).toHaveLength(4);
    const [draft, awaiting, rejected, lapsed] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];

    expect(within(draft).getByRole("heading", { level: 3, name: "Version 1" })).toBeTruthy();
    expect(within(draft).getByText("Draft")).toBeTruthy();
    expect(within(draft).queryByText(/^Sent to the owner: /)).toBeNull();
    expect(within(draft).queryByText(ANSWER_LINE)).toBeNull();

    expect(within(awaiting).getByRole("heading", { level: 3, name: "Version 2" })).toBeTruthy();
    expect(within(awaiting).getByText("Awaiting the owner")).toBeTruthy();
    expect(within(awaiting).getByText(/^Sent to the owner: /).textContent).toMatch(/^Sent to the owner: Nov 21, 2026.*10:15/);
    expect(within(awaiting).getByText(ANSWER_LINE).textContent).toMatch(/^The owner may answer until Nov 28, 2026.*10:15/);

    expect(within(rejected).getByRole("heading", { level: 3, name: "Version 3" })).toBeTruthy();
    expect(within(rejected).getByText("Rejected by the owner")).toBeTruthy();
    expect(within(rejected).getByText(/^Sent to the owner: /).textContent).toMatch(/^Sent to the owner: Nov 21, 2026.*10:15/);
    expect(within(rejected).getByText(ANSWER_LINE).textContent).toMatch(/^Rejected by the owner on Nov 22, 2026.*10:15/);
    expect(within(rejected).getByText("Reason: The rent is too low.")).toBeTruthy();

    expect(within(lapsed).getByRole("heading", { level: 3, name: "Version 4" })).toBeTruthy();
    expect(within(lapsed).getByText("Lapsed")).toBeTruthy();
    expect(within(lapsed).getByText(/^Sent to the owner: /).textContent).toMatch(/^Sent to the owner: Nov 21, 2026.*10:15/);
    expect(within(lapsed).getByText(ANSWER_LINE).textContent).toMatch(/^No answer by Nov 28, 2026.*10:15/);
    expect(within(lapsed).queryByText(/^Reason: /)).toBeNull();
  });
});

describe("AgreementVersionList, activation lines (brokerage-agreement E05-S6, S6-D22, UF-5)", () => {
  const ACTIVATED_RECORD = {
    decision: "ACTIVATED",
    decidedAt: "2026-11-18T03:00:00Z",
    documentNumber: "HDMG-2026/014",
    signedOn: "2026-11-16",
    sunvibeSignatoryName: "Nguyen Van A",
    sunvibeSignatoryTitle: "Director",
    refusalType: null,
    refusalNote: null,
  } as const satisfies NonNullable<Version["activation"]>;
  const SENT = {
    ...PERIOD,
    sentAt: "2026-11-16T03:15:00Z",
    answerBy: "2026-11-23T03:15:00Z",
    ownerAnsweredAt: "2026-11-17T03:15:00Z",
  } as const;

  it("agreementVersionList_activationLines_documentRefusalAndNotActivated: activated and in-effect versions show their document line, a refused one its reason and note, a 14-day lapse Not activated by, a 7-day lapse still No answer by", () => {
    const rows = renderList(
      rowsOf({
        ...DETAIL,
        status: "ACTIVE",
        versions: [
          {
            versionNo: 1,
            status: "ACTIVATION_REFUSED",
            ...SENT,
            activateBy: "2026-12-01T03:15:00Z",
            activation: {
              decision: "REFUSED",
              decidedAt: "2026-11-18T03:00:00Z",
              refusalType: "SIGNER_NOT_OWNER",
              refusalNote: "The signature is not the owner's.",
            },
          },
          { versionNo: 2, status: "LAPSED", ...SENT, activateBy: "2026-12-01T03:15:00Z", activation: null },
          { versionNo: 3, status: "LAPSED", ...SENT, activateBy: null },
          { versionNo: 4, status: "ACTIVATED", ...SENT, activateBy: "2026-12-01T03:15:00Z", activation: ACTIVATED_RECORD },
          { versionNo: 5, status: "EFFECTIVE", ...SENT, activateBy: "2026-12-01T03:15:00Z", activation: ACTIVATED_RECORD },
        ],
      }),
    );
    const [refused, notActivated, lapsed, activated, effective] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    const DOCUMENT = "Document HDMG-2026/014, signed on 16 Nov 2026; signed for Sunvibe by Nguyen Van A, Director.";

    expect(within(refused).getByText(/^Activation refused on /).textContent).toMatch(
      /^Activation refused on Nov 18, 2026.*10:00.*: The owner did not sign it\.$/,
    );
    expect(within(refused).getByText("Note: The signature is not the owner's.")).toBeTruthy();
    expect(within(refused).queryByText(/^Document /)).toBeNull();

    expect(within(notActivated).getByText(ANSWER_LINE_WITH_LAPSES).textContent).toMatch(/^Not activated by Dec 1, 2026.*10:15/);
    expect(within(notActivated).queryByText(/^No answer by /)).toBeNull();

    expect(within(lapsed).getByText(ANSWER_LINE_WITH_LAPSES).textContent).toMatch(/^No answer by Nov 23, 2026.*10:15/);
    expect(within(lapsed).queryByText(/^Not activated by /)).toBeNull();

    expect(within(activated).getByText(/^Activated on /).textContent).toMatch(
      /^Activated on Nov 18, 2026.*10:00.*; takes effect on 1 Jan 2027\.$/,
    );
    expect(within(activated).getByText(DOCUMENT)).toBeTruthy();
    expect(within(activated).queryByText(/^Activation refused/)).toBeNull();

    expect(within(effective).getByText("In effect.")).toBeTruthy();
    expect(within(effective).getByText(DOCUMENT)).toBeTruthy();
  });
});
