import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail } from "../types";

// The edge only: the detail call and the new-draft call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getAgreement: vi.fn(),
  openDraft: vi.fn(),
}));

import { getAgreement, openDraft } from "../services/agreement-api";

import { AgreementDetailView } from "./agreement-detail-view";

const m = en.BrokerageAgreement.detail;
const AGREEMENT_ID = "01JF000000000000000000000A";

/** The answer of spec section 4's example. */
const DETAIL: BrokerageAgreementDetail = {
  agreementId: AGREEMENT_ID,
  status: "DRAFTING",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  unitCode: "P101",
  basisLeadId: "01JE2EHEAD0000000000000015",
  createdAt: "2026-11-20T03:15:00Z",
  versions: [{ versionNo: 1, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31", createdAt: "2026-11-20T03:15:00Z" }],
};

const answered = (data: BrokerageAgreementDetail): ApiResult<BrokerageAgreementDetail> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});
const http = (status: number, code: string, correlationId?: string): ApiResult<BrokerageAgreementDetail> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  ...(correlationId === undefined ? {} : { correlationId }),
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDetailView agreementId={AGREEMENT_ID} />
    </NextIntlClientProvider>,
  );
}

describe("AgreementDetailView (brokerage-agreement E05-S2, spec section 6)", () => {
  beforeEach(() => {
    vi.mocked(getAgreement).mockReset();
  });

  it("agreementDetailView_ready_headerAndVersion: loading, then the header and version 1 with its calendar dates", async () => {
    let answer: (result: ApiResult<BrokerageAgreementDetail>) => void = () => undefined;
    vi.mocked(getAgreement).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderView();

    expect(screen.getByRole("status").textContent).toBe(m.loading);
    answer(answered(DETAIL));

    expect(await screen.findByRole("heading", { level: 1, name: m.title })).toBeTruthy();
    expect(screen.queryByText(m.loading)).toBeNull();
    expect(screen.getByText("Drafting")).toBeTruthy();
    expect(screen.getByText("Long-term rental")).toBeTruthy();
    expect(screen.getByText("P101")).toBeTruthy();
    expect(screen.getByText(/Nov 20, 2026/).textContent).toMatch(/10:15/);
    for (const label of [m.status, m.transactionType, m.unit, m.createdAt]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("link", { name: m.openLead }).getAttribute("href")).toBe(
      "/workspace/owner-leads/01JE2EHEAD0000000000000015",
    );

    const versions = screen.getByRole("region", { name: m.versions });
    const [version] = within(versions).getAllByRole("listitem");
    expect(within(version as HTMLElement).getByText("Version 1")).toBeTruthy();
    expect(within(version as HTMLElement).getByText("Draft")).toBeTruthy();
    expect(within(version as HTMLElement).getByText(m.startDate)).toBeTruthy();
    expect(within(version as HTMLElement).getByText("1 Jan 2027")).toBeTruthy();
    expect(within(version as HTMLElement).getByText(m.endDate)).toBeTruthy();
    expect(within(version as HTMLElement).getByText("31 Dec 2027")).toBeTruthy();
    expect(getAgreement).toHaveBeenCalledTimes(1);
    expect(getAgreement).toHaveBeenCalledWith(AGREEMENT_ID);
  });

  it("agreementDetailView_noCode_noCodeText: a unit with no code says so", async () => {
    vi.mocked(getAgreement).mockResolvedValue(answered({ ...DETAIL, unitCode: null }));
    renderView();

    expect(await screen.findByText(m.noCode)).toBeTruthy();
  });

  it("agreementDetailView_notFoundOrForbidden_notAvailable: a 404 and a 403 say the agreement is not available", async () => {
    for (const answer of [http(404, "NOT_FOUND", "c-1"), http(403, "FORBIDDEN", "c-2")]) {
      vi.mocked(getAgreement).mockResolvedValue(answer);
      const { unmount } = renderView();

      expect(await screen.findByText(m.notFound)).toBeTruthy();
      expect(screen.queryByRole("heading", { level: 1, name: m.title })).toBeNull();
      expect(screen.queryByText(/Support code/)).toBeNull();

      unmount();
      vi.mocked(getAgreement).mockReset();
    }
  });

  it("agreementDetailView_failedRead_retryReadsAgain: a failed read says so with its support code, and Try again reads again", async () => {
    vi.mocked(getAgreement).mockResolvedValueOnce(http(500, "INTERNAL_ERROR", "c-7"));
    renderView();

    expect(await screen.findByText(m.loadFailed)).toBeTruthy();
    expect(screen.getByText("Support code: c-7")).toBeTruthy();

    vi.mocked(getAgreement).mockResolvedValueOnce(answered(DETAIL));
    fireEvent.click(screen.getByRole("button", { name: m.retry }));

    expect(await screen.findByRole("heading", { level: 1, name: m.title })).toBeTruthy();
    expect(screen.queryByText(m.loadFailed)).toBeNull();
    expect(getAgreement).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getAgreement).mock.calls.map(([id]) => id)).toEqual([AGREEMENT_ID, AGREEMENT_ID]);
  });

  it("agreementDetailView_unknownStatus_anotherState: a state this UI does not know is shown, never dropped", async () => {
    vi.mocked(getAgreement).mockResolvedValue(
      answered({
        ...DETAIL,
        status: "PAUSED" as BrokerageAgreementDetail["status"],
        versions: [{ ...DETAIL.versions?.[0], status: "WITHDRAWN" as never }],
      }),
    );
    renderView();

    await screen.findByRole("heading", { level: 1, name: m.title });
    expect(screen.getAllByText("Another state")).toHaveLength(2);
  });

  it("agreementDetailView_sentVersion_sentLineAndBothProposedLines: a sent version shows its state, when it was sent and both proposed lines once, and no action (brokerage-agreement E05-S4, UF-3, S4-D15)", async () => {
    vi.mocked(getAgreement).mockResolvedValue(
      answered({
        ...DETAIL,
        status: "AWAITING_CONFIRMATION",
        dataVersion: 2,
        viewerIsAssignedSale: true,
        versions: [
          {
            versionNo: 1,
            status: "AWAITING_OWNER",
            startDate: "2027-01-01",
            endDate: "2027-12-31",
            createdAt: "2026-11-20T03:15:00Z",
            sentAt: "2026-11-21T03:15:00.123456Z",
          },
        ],
      }),
    );
    renderView();

    await screen.findByRole("heading", { level: 1, name: m.title });
    expect(screen.getByText("Awaiting confirmation")).toBeTruthy();
    const versions = screen.getByRole("region", { name: m.versions });
    const [version] = within(versions).getAllByRole("listitem");
    expect(within(version as HTMLElement).getByText("Awaiting the owner")).toBeTruthy();
    expect(within(version as HTMLElement).getByText(/^Sent to the owner: /).textContent).toMatch(/Nov 21, 2026.*10:15/);
    expect(screen.getAllByText("Proposed terms: not confirmed by the owner yet.")).toHaveLength(1);
    expect(screen.getAllByText("Proposed fee policy: not confirmed by the owner yet.")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Edit the draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to the owner" })).toBeNull();
  });
});

describe("AgreementDetailView, the owner's answer and a new draft (brokerage-agreement E05-S5, S5-D10, S5-D13, UF-1)", () => {
  beforeEach(() => {
    vi.mocked(getAgreement).mockReset();
    vi.mocked(openDraft).mockReset();
  });

  const REJECTED = {
    versionNo: 1,
    status: "OWNER_REJECTED",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    createdAt: "2026-11-20T03:15:00Z",
    sentAt: "2026-11-21T03:15:00Z",
    answerBy: "2026-11-28T03:15:00Z",
    ownerAnsweredAt: "2026-11-22T03:15:00Z",
    ownerRejectionReason: "The rent is too low.",
  } as const satisfies NonNullable<BrokerageAgreementDetail["versions"]>[number];

  it("agreementDetailView_rejectedVersion_answerLinesAndOpenDraft: a declined version shows when and why; the assigned Sale opens a new draft once, and the page then shows version 2 as a draft to edit and send", async () => {
    vi.mocked(getAgreement)
      .mockResolvedValueOnce(answered({ ...DETAIL, status: "DRAFTING", dataVersion: 3, viewerIsAssignedSale: true, versions: [REJECTED] }))
      .mockResolvedValueOnce(
        answered({
          ...DETAIL,
          status: "DRAFTING",
          dataVersion: 4,
          viewerIsAssignedSale: true,
          versions: [
            REJECTED,
            { versionNo: 2, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31", createdAt: "2026-11-23T03:15:00Z" },
          ],
        }),
      );
    vi.mocked(openDraft).mockResolvedValueOnce({ ok: true, status: 204, replayed: false, data: undefined });
    renderView();

    await screen.findByRole("heading", { level: 1, name: m.title });
    const versions = screen.getByRole("region", { name: m.versions });
    expect(within(versions).getByText("Rejected by the owner")).toBeTruthy();
    expect(within(versions).getByText(/^Rejected by the owner on /).textContent).toMatch(/Nov 22, 2026.*10:15/);
    expect(within(versions).getByText("Reason: The rent is too low.")).toBeTruthy();
    expect(screen.getByText(en.BrokerageAgreement.newDraft.notice)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit the draft" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.BrokerageAgreement.newDraft.open }));

    expect(await screen.findByText("Version 2")).toBeTruthy();
    expect(vi.mocked(openDraft).mock.calls.map((call) => call.slice(0, 2))).toEqual([[AGREEMENT_ID, { expectedDataVersion: 3 }]]);
    expect(getAgreement).toHaveBeenCalledTimes(2);
    const [, second] = within(screen.getByRole("region", { name: m.versions })).getAllByRole("listitem");
    expect(within(second as HTMLElement).getByText("Draft")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit the draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send to the owner" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.BrokerageAgreement.newDraft.open })).toBeNull();
  });

  it("agreementDetailView_newDraftNotAllowed_reloadsWithItsText: a new draft refused for a pending version says so and the page reads the agreement again", async () => {
    vi.mocked(getAgreement)
      .mockResolvedValueOnce(answered({ ...DETAIL, status: "DRAFTING", dataVersion: 3, viewerIsAssignedSale: true, versions: [REJECTED] }))
      .mockResolvedValueOnce(
        answered({
          ...DETAIL,
          status: "AWAITING_CONFIRMATION",
          dataVersion: 5,
          viewerIsAssignedSale: true,
          versions: [REJECTED, { ...REJECTED, versionNo: 2, status: "AWAITING_OWNER", ownerAnsweredAt: null, ownerRejectionReason: null }],
        }),
      );
    vi.mocked(openDraft).mockResolvedValueOnce({
      ok: false,
      kind: "http",
      status: 409,
      code: "AGREEMENT_NEW_DRAFT_NOT_ALLOWED",
      fieldErrors: [],
    });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: en.BrokerageAgreement.newDraft.open }));

    expect(await screen.findByText(en.BrokerageAgreement.newDraft.pending)).toBeTruthy();
    expect(await screen.findByText("Version 2")).toBeTruthy();
    expect(getAgreement).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: en.BrokerageAgreement.newDraft.open })).toBeNull();
  });

  it("agreementDetailView_answerLines_eachState: the deadline, a confirmation, a declined version without a reason and a lapse each read their line", async () => {
    const at = (versionNo: number, version: Partial<NonNullable<BrokerageAgreementDetail["versions"]>[number]>) => ({
      ...REJECTED,
      ownerRejectionReason: null,
      ...version,
      versionNo,
    });
    vi.mocked(getAgreement).mockResolvedValue(
      answered({
        ...DETAIL,
        status: "AWAITING_CONFIRMATION",
        dataVersion: 5,
        viewerIsAssignedSale: true,
        versions: [
          at(1, { status: "OWNER_REJECTED" }),
          at(2, { status: "LAPSED" }),
          at(3, { status: "OWNER_CONFIRMED" }),
          at(4, { status: "AWAITING_OWNER", ownerAnsweredAt: null }),
        ],
      }),
    );
    renderView();

    await screen.findByRole("heading", { level: 1, name: m.title });
    const rows = within(screen.getByRole("region", { name: m.versions })).getAllByRole("listitem") as HTMLElement[];
    expect(within(rows[0] as HTMLElement).getByText("No reason given.")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText(/^No answer by /).textContent).toMatch(/Nov 28, 2026.*10:15/);
    expect(within(rows[2] as HTMLElement).getByText(/^Confirmed by the owner on /).textContent).toMatch(/Nov 22, 2026.*10:15/);
    expect(within(rows[3] as HTMLElement).getByText(/^The owner may answer until /).textContent).toMatch(/Nov 28, 2026.*10:15/);
    expect(screen.queryByRole("button", { name: en.BrokerageAgreement.newDraft.open })).toBeNull();
  });
});
