import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail } from "../types";

// The edge only: the detail and the four stop calls, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getAgreement: vi.fn(),
  suspendAgreement: vi.fn(),
  releaseAgreementSuspension: vi.fn(),
  terminateAgreement: vi.fn(),
  cancelAgreement: vi.fn(),
}));

import {
  cancelAgreement,
  getAgreement,
  releaseAgreementSuspension,
  suspendAgreement,
  terminateAgreement,
} from "../services/agreement-api";

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
const TOOK_EFFECT = "This agreement has taken effect: end it instead.";
const NOT_INDEPENDENT = "Only a manager who is not the lead's assigned Sale may lift the suspension.";
const CHANGED = "This agreement changed. Read it again.";

const ACTIVE: BrokerageAgreementDetail = {
  agreementId: AGREEMENT_ID,
  status: "ACTIVE",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  unitCode: "P101",
  basisLeadId: "01JE2EHEAD0000000000000015",
  createdAt: "2026-11-15T03:15:00Z",
  dataVersion: 7,
  viewerIsAssignedSale: false,
  versions: [{ versionNo: 1, status: "EFFECTIVE", startDate: "2026-11-01", endDate: "2027-10-31" }],
  advertising: { allowed: true, reasonGroups: [], endDate: "2027-10-31" },
  viewerStopActions: ["SUSPEND", "TERMINATE_OWNER_WITHDREW", "TERMINATE_SUNVIBE"],
};

const SUSPENDED: BrokerageAgreementDetail = {
  ...ACTIVE,
  status: "SUSPENDED",
  dataVersion: 8,
  advertising: { allowed: false, reasonGroups: ["SUSPENDED"], endDate: "2027-10-31" },
  suspensions: [{ reasonType: "COMPLAINT", note: null, suspendedAt: "2026-12-01T03:00:00Z", releasedAt: null, releaseReason: null }],
  viewerStopActions: ["RELEASE_SUSPENSION", "TERMINATE_OWNER_WITHDREW", "TERMINATE_SUNVIBE"],
};

const DRAFTING: BrokerageAgreementDetail = {
  ...ACTIVE,
  status: "DRAFTING",
  dataVersion: 3,
  versions: [{ versionNo: 1, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31" }],
  advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
  viewerIsAssignedSale: true,
  viewerStopActions: ["CANCEL", "TERMINATE_OWNER_WITHDREW", "TERMINATE_UNIT_LET"],
};

const answered = (data: BrokerageAgreementDetail): ApiResult<BrokerageAgreementDetail> => ({ ok: true, status: 200, replayed: false, data });
const NO_CONTENT: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };
const refused = (status: number, code: string): ApiResult<undefined> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDetailView agreementId={AGREEMENT_ID} />
    </NextIntlClientProvider>,
  );
}

const stopSection = () => screen.findByRole("region", { name: "Agreement state" });
const header = () => screen.findByRole("heading", { level: 1, name: b.detail.title });
const dialog = () => screen.getByRole("dialog");

/** Suspends the agreement on the page once, with a complaint. */
async function suspendOnce() {
  fireEvent.click(within(await stopSection()).getByRole("button", { name: "Suspend" }));
  fireEvent.change(within(dialog()).getByLabelText("Reason"), { target: { value: "COMPLAINT" } });
  fireEvent.click(within(dialog()).getByRole("button", { name: "Suspend" }));
}

describe("AgreementDetailView, the stop section (brokerage-agreement E05-S8, spec section 6, UF-1 to UF-4, E05S8-P15)", () => {
  beforeEach(() => {
    for (const call of [getAgreement, suspendAgreement, releaseAgreementSuspension, terminateAgreement, cancelAgreement]) {
      vi.mocked(call).mockReset();
    }
  });

  it("agreementDetailView_stopSection_afterAdvertisingNoCallOnMount: the section follows the advertising panel and precedes the versions; nothing but the detail is read on mount; an answer without stop data shows no section", async () => {
    vi.mocked(getAgreement).mockResolvedValue(answered(ACTIVE));
    const view = renderView();

    const section = await stopSection();
    const advertising = screen.getByRole("region", { name: b.advertising.title });
    const versions = screen.getByRole("region", { name: b.detail.versions });
    expect(advertising.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(versions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getAllByRole("button").map((button) => button.textContent)).toEqual(["Suspend", "End the agreement"]);
    expect(getAgreement).toHaveBeenCalledTimes(1);
    for (const call of [suspendAgreement, releaseAgreementSuspension, terminateAgreement, cancelAgreement]) {
      expect(call).not.toHaveBeenCalled();
    }
    view.unmount();

    vi.mocked(getAgreement).mockResolvedValue(answered({ ...ACTIVE, viewerStopActions: undefined }));
    renderView();
    await header();
    expect(screen.queryByRole("region", { name: "Agreement state" })).toBeNull();
  });

  it("agreementDetailView_stopDone_rereadsThePage: a 204 reads the detail again, with no refusal sentence", async () => {
    vi.mocked(getAgreement).mockResolvedValueOnce(answered(ACTIVE)).mockResolvedValueOnce(answered(SUSPENDED));
    vi.mocked(suspendAgreement).mockResolvedValueOnce(NO_CONTENT);
    renderView();

    await suspendOnce();

    expect(await screen.findByText(/^Suspended since 2026-12-01 10:00: a complaint\.$/)).toBeTruthy();
    expect(getAgreement).toHaveBeenCalledTimes(2);
    expect(screen.getByText(b.advertising.reasons.SUSPENDED)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    for (const sentence of [TOOK_EFFECT, NOT_INDEPENDENT, CHANGED]) expect(screen.queryByText(sentence)).toBeNull();
  });

  it("agreementDetailView_stopRefused_sentenceAfterReread: a refused cancellation or release reads the detail again, and once that read is in, the code's sentence is on the page", async () => {
    let second: (result: ApiResult<BrokerageAgreementDetail>) => void = () => undefined;
    vi.mocked(getAgreement)
      .mockResolvedValueOnce(answered(DRAFTING))
      .mockReturnValueOnce(new Promise((resolve) => (second = resolve)));
    vi.mocked(cancelAgreement).mockResolvedValueOnce(refused(409, "AGREEMENT_TOOK_EFFECT"));
    const view = renderView();

    fireEvent.click(within(await stopSection()).getByRole("button", { name: "Cancel the agreement" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel the agreement" }));

    await waitFor(() => expect(getAgreement).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toBeTruthy();
    second(answered({ ...DRAFTING, status: "ACTIVE", viewerStopActions: ["TERMINATE_OWNER_WITHDREW", "TERMINATE_UNIT_LET"] }));
    expect(await screen.findByText(TOOK_EFFECT)).toBeTruthy();
    expect(await stopSection()).toBeTruthy();
    expect(cancelAgreement).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cancelAgreement).mock.calls[0]?.slice(0, 2)).toEqual([AGREEMENT_ID, { expectedDataVersion: 3 }]);
    view.unmount();

    vi.mocked(getAgreement).mockResolvedValueOnce(answered(SUSPENDED)).mockResolvedValueOnce(answered(SUSPENDED));
    vi.mocked(releaseAgreementSuspension).mockResolvedValueOnce(refused(403, "AGREEMENT_RELEASER_NOT_INDEPENDENT"));
    renderView();
    fireEvent.click(within(await stopSection()).getByRole("button", { name: "Lift the suspension" }));
    fireEvent.change(within(dialog()).getByLabelText("Reason for lifting it"), { target: { value: "Checked." } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Lift" }));

    expect(await screen.findByText(NOT_INDEPENDENT)).toBeTruthy();
    expect(getAgreement).toHaveBeenCalledTimes(4);
    expect(vi.mocked(releaseAgreementSuspension).mock.calls[0]?.slice(0, 2)).toEqual([
      AGREEMENT_ID,
      { expectedDataVersion: 8, reason: "Checked." },
    ]);
  });

  it("agreementDetailView_stopForbidden_changedSentenceAfterReread: a 403 FORBIDDEN reads This agreement changed after the reread, also when the new answer offers no stop", async () => {
    vi.mocked(getAgreement)
      .mockResolvedValueOnce(answered(ACTIVE))
      .mockResolvedValueOnce(answered({ ...ACTIVE, viewerStopActions: undefined }));
    vi.mocked(suspendAgreement).mockResolvedValueOnce(refused(403, "FORBIDDEN"));
    renderView();

    await suspendOnce();

    expect(await screen.findByText(CHANGED)).toBeTruthy();
    expect(getAgreement).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("region", { name: "Agreement state" })).toBeNull();
  });

  it("agreementDetailView_stopRefusedThenDone_sentenceCleared: a later 204, or Reload after a change at the same time, clears the kept sentence", async () => {
    vi.mocked(getAgreement)
      .mockResolvedValueOnce(answered(ACTIVE))
      .mockResolvedValueOnce(answered(ACTIVE))
      .mockResolvedValueOnce(answered(SUSPENDED));
    vi.mocked(suspendAgreement).mockResolvedValueOnce(refused(409, "SOMETHING_NEW")).mockResolvedValueOnce(NO_CONTENT);
    const first = renderView();

    await suspendOnce();
    expect(await screen.findByText(CHANGED)).toBeTruthy();
    await suspendOnce();
    expect(await screen.findByText(/^Suspended since /)).toBeTruthy();
    expect(screen.queryByText(CHANGED)).toBeNull();
    expect(getAgreement).toHaveBeenCalledTimes(3);
    first.unmount();

    vi.mocked(getAgreement).mockReset();
    vi.mocked(getAgreement).mockResolvedValue(answered(ACTIVE));
    vi.mocked(suspendAgreement).mockReset();
    vi.mocked(suspendAgreement)
      .mockResolvedValueOnce(refused(409, "AGREEMENT_ENDED"))
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 409, code: "CONCURRENT_MODIFICATION", fieldErrors: [] });
    renderView();

    await suspendOnce();
    expect(await screen.findByText("This agreement has ended.")).toBeTruthy();
    await suspendOnce();
    const alert = await within(dialog()).findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(getAgreement).toHaveBeenCalledTimes(3));
    await stopSection();
    expect(screen.queryByText("This agreement has ended.")).toBeNull();
  });
});
