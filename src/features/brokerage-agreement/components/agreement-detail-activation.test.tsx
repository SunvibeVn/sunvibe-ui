import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail, BrokerageAgreementVersion } from "../types";

// The edge only: the detail, new-draft, activation and refusal calls, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getAgreement: vi.fn(),
  openDraft: vi.fn(),
  activate: vi.fn(),
  refuseActivation: vi.fn(),
}));

import { activate, getAgreement } from "../services/agreement-api";

import { AgreementDetailView } from "./agreement-detail-view";

// jsdom has the dialog element but not its methods (see agreement-draft-dialog.test.tsx).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

const b = en.BrokerageAgreement;
const AGREEMENT_ID = "01JF000000000000000000000A";
const STATEMENT = { version: "brokerage-activation-2026-11", text: "I compared every term of version 1 with the signed document." };

/** An E05-S5 answer of this file's own: none of the three properties E05-S6 adds to the detail. */
const DETAIL: BrokerageAgreementDetail = {
  agreementId: AGREEMENT_ID,
  status: "AWAITING_CONFIRMATION",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  unitCode: "P101",
  basisLeadId: "01JE2EHEAD0000000000000015",
  createdAt: "2026-11-15T03:15:00Z",
  dataVersion: 7,
  viewerIsAssignedSale: false,
  versions: [],
};

const SENT = {
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  createdAt: "2026-11-15T03:15:00Z",
  sentAt: "2026-11-16T03:15:00Z",
  answerBy: "2026-11-23T03:15:00Z",
} as const;

const CONFIRMED: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "OWNER_CONFIRMED",
  ...SENT,
  ownerAnsweredAt: "2026-11-17T03:15:00Z",
  activateBy: "2026-12-01T03:15:00Z",
  activation: null,
};

const answered = (data: BrokerageAgreementDetail): ApiResult<BrokerageAgreementDetail> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDetailView agreementId={AGREEMENT_ID} />
    </NextIntlClientProvider>,
  );
}

const versionsRegion = () => screen.getByRole("region", { name: b.detail.versions });
const WAITING = /^Waiting for a manager's activation until /;

describe("AgreementDetailView, activation and the advertising answer (brokerage-agreement E05-S6, S6-D8, S6-D22, S6-D24)", () => {
  beforeEach(() => {
    vi.mocked(getAgreement).mockReset();
    vi.mocked(activate).mockReset();
  });

  it("agreementDetailView_noAdvertising_noPanelNoSection: an answer without the new properties shows no panel, no section and no waiting line", async () => {
    vi.mocked(getAgreement).mockResolvedValue(answered({ ...DETAIL, versions: [CONFIRMED] }));
    renderView();

    await screen.findByRole("heading", { level: 1, name: b.detail.title });
    expect(screen.queryByRole("region", { name: b.advertising.title })).toBeNull();
    expect(screen.queryByRole("region", { name: b.activation.title })).toBeNull();
    expect(screen.queryByText(WAITING)).toBeNull();
    expect(within(versionsRegion()).getByText(/^Confirmed by the owner on /)).toBeTruthy();
  });

  it("agreementDetailView_statementWithoutMayDecide_waitingLineOnly: a reader who may not decide sees until when the version waits, and no activation section", async () => {
    vi.mocked(getAgreement).mockResolvedValue(
      answered({
        ...DETAIL,
        versions: [CONFIRMED],
        activationStatement: STATEMENT,
        advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
      }),
    );
    renderView();

    await screen.findByRole("heading", { level: 1, name: b.detail.title });
    expect(within(versionsRegion()).getByText(WAITING).textContent).toMatch(/^Waiting for a manager's activation until Dec 1, 2026.*10:15.*\.$/);
    expect(screen.queryByRole("region", { name: b.activation.title })).toBeNull();
    expect(screen.queryByRole("button", { name: b.activation.activate })).toBeNull();
    const panel = screen.getByRole("region", { name: b.advertising.title });
    expect(within(panel).getByText(b.advertising.reasons.NOT_IN_EFFECT)).toBeTruthy();
  });

  it("agreementDetailView_fourCauses_sameNoticeBesideItsLine: after each of the four causes the assigned Sale sees the same notice and Open a new draft beside the line that says why", async () => {
    const drafting = (version: BrokerageAgreementVersion): BrokerageAgreementDetail => ({
      ...DETAIL,
      status: "DRAFTING",
      dataVersion: 3,
      viewerIsAssignedSale: true,
      versions: [version],
      advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
      viewerMayDecideActivation: false,
      activationStatement: null,
    });
    const causes: [BrokerageAgreementVersion, RegExp][] = [
      [{ ...CONFIRMED, status: "OWNER_REJECTED", activateBy: null }, /^Rejected by the owner on /],
      [{ ...CONFIRMED, status: "LAPSED", ownerAnsweredAt: null, activateBy: null }, /^No answer by /],
      [
        {
          ...CONFIRMED,
          status: "ACTIVATION_REFUSED",
          activation: { decision: "REFUSED", decidedAt: "2026-11-18T03:00:00Z", refusalType: "DOCUMENT_DIFFERS", refusalNote: null },
        },
        /^Activation refused on /,
      ],
      [{ ...CONFIRMED, status: "LAPSED" }, /^Not activated by /],
    ];

    for (const [version, line] of causes) {
      vi.mocked(getAgreement).mockResolvedValueOnce(answered(drafting(version)));
      const { unmount } = renderView();

      await screen.findByRole("heading", { level: 1, name: b.detail.title });
      const region = versionsRegion();
      expect(within(region).getByText(b.newDraft.notice)).toBeTruthy();
      expect(within(region).getByRole("button", { name: b.newDraft.open })).toBeTruthy();
      expect(within(region).getByText(line)).toBeTruthy();
      expect(screen.queryByText(WAITING)).toBeNull();
      unmount();
    }
  });

  it("agreementDetailView_activated_readsAgain: an independent manager activates once, the page reads the detail again and shows the version's new lines", async () => {
    vi.mocked(getAgreement)
      .mockResolvedValueOnce(
        answered({
          ...DETAIL,
          versions: [CONFIRMED],
          viewerMayDecideActivation: true,
          activationStatement: STATEMENT,
          advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
        }),
      )
      .mockResolvedValueOnce(
        answered({
          ...DETAIL,
          status: "ACTIVE",
          dataVersion: 8,
          versions: [
            {
              ...CONFIRMED,
              status: "ACTIVATED",
              activation: {
                decision: "ACTIVATED",
                decidedAt: "2026-11-18T03:00:00Z",
                documentNumber: "HDMG-2026/014",
                signedOn: "2026-11-16",
                sunvibeSignatoryName: "Nguyen Van A",
                sunvibeSignatoryTitle: "Director",
              },
            },
          ],
          viewerMayDecideActivation: false,
          activationStatement: null,
          advertising: {
            allowed: false,
            reasonGroups: ["NOT_STARTED"],
            pendingVersion: { startDate: "2027-01-01", startsAt: "2026-12-31T17:00:00Z" },
          },
        }),
      );
    vi.mocked(activate).mockResolvedValueOnce({ ok: true, status: 204, replayed: false, data: undefined });
    renderView();

    const section = await screen.findByRole("region", { name: b.activation.title });
    fireEvent.change(within(section).getByLabelText(b.activation.documentNumber), { target: { value: "HDMG-2026/014" } });
    fireEvent.change(within(section).getByLabelText(b.activation.signedOn), { target: { value: "2026-11-16" } });
    fireEvent.change(within(section).getByLabelText(b.activation.signatoryName), { target: { value: "Nguyen Van A" } });
    fireEvent.change(within(section).getByLabelText(b.activation.signatoryTitle), { target: { value: "Director" } });
    fireEvent.click(within(section).getByRole("checkbox", { name: b.activation.statementBox }));
    fireEvent.click(within(section).getByRole("button", { name: b.activation.activate }));

    expect(await screen.findByText(/^Activated on /)).toBeTruthy();
    expect(screen.getByText("Document HDMG-2026/014, signed on 16 Nov 2026; signed for Sunvibe by Nguyen Van A, Director.")).toBeTruthy();
    expect(screen.getByText("Advertising starts on 1 Jan 2027.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: b.activation.title })).toBeNull();
    expect(screen.queryByText(b.activation.changed)).toBeNull();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(activate).mock.calls[0]?.slice(0, 2)).toEqual([
      AGREEMENT_ID,
      {
        expectedDataVersion: 7,
        versionNo: 1,
        statementVersion: STATEMENT.version,
        documentNumber: "HDMG-2026/014",
        signedOn: "2026-11-16",
        sunvibeSignatoryName: "Nguyen Van A",
        sunvibeSignatoryTitle: "Director",
      },
    ]);
    expect(getAgreement).toHaveBeenCalledTimes(2);
  });

  it("agreementDetailView_activationChanged_reloadsWithItsText: a statement that changed meanwhile makes the page read the detail again and say so after that read", async () => {
    const awaiting = answered({
      ...DETAIL,
      versions: [CONFIRMED],
      viewerMayDecideActivation: true,
      activationStatement: STATEMENT,
      advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
    });
    vi.mocked(getAgreement).mockResolvedValueOnce(awaiting).mockResolvedValueOnce(awaiting);
    vi.mocked(activate).mockResolvedValueOnce({
      ok: false,
      kind: "http",
      status: 409,
      code: "AGREEMENT_STATEMENT_OUTDATED",
      fieldErrors: [],
    });
    renderView();

    const section = await screen.findByRole("region", { name: b.activation.title });
    fireEvent.change(within(section).getByLabelText(b.activation.documentNumber), { target: { value: "HDMG-2026/014" } });
    fireEvent.change(within(section).getByLabelText(b.activation.signedOn), { target: { value: "2026-11-16" } });
    fireEvent.change(within(section).getByLabelText(b.activation.signatoryName), { target: { value: "Nguyen Van A" } });
    fireEvent.change(within(section).getByLabelText(b.activation.signatoryTitle), { target: { value: "Director" } });
    fireEvent.click(within(section).getByRole("checkbox", { name: b.activation.statementBox }));
    fireEvent.click(within(section).getByRole("button", { name: b.activation.activate }));

    await waitFor(() => expect(getAgreement).toHaveBeenCalledTimes(2));
    expect(await within(versionsRegion()).findByText(b.activation.changed)).toBeTruthy();
    // The read replaced the section: its fields start empty again, and the text stays above the versions.
    const again = screen.getByRole("region", { name: b.activation.title });
    expect((within(again).getByLabelText(b.activation.documentNumber) as HTMLInputElement).value).toBe("");
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
