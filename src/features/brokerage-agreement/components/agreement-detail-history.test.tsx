import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail, BrokerageAgreementHistory, BrokerageAgreementHistoryEntry } from "../types";

// The edge only: the detail, the new-draft and the history calls, the module's other exports kept.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getAgreement: vi.fn(),
  openDraft: vi.fn(),
  getAgreementHistory: vi.fn(),
}));

import { getAgreement, getAgreementHistory, openDraft } from "../services/agreement-api";

import { AgreementDetailView } from "./agreement-detail-view";

const m = en.BrokerageAgreement.detail;
const h = en.BrokerageAgreement.history;
const AGREEMENT_ID = "01JF000000000000000000000A";

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

const answered = (data: BrokerageAgreementDetail): ApiResult<BrokerageAgreementDetail> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});

/** The assigned Sale's page with a declined version (data version 3), then the page after the new draft (4). */
const BEFORE = answered({ ...DETAIL, dataVersion: 3, viewerIsAssignedSale: true, versions: [REJECTED] });
const AFTER = answered({
  ...DETAIL,
  dataVersion: 4,
  viewerIsAssignedSale: true,
  versions: [
    REJECTED,
    { versionNo: 2, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31", createdAt: "2026-11-23T03:15:00Z" },
  ],
});

const entry = (type: string, versionNo: number, occurredAt: string) =>
  ({ type, versionNo, actorType: "STAFF", actorName: "Lan Nguyen", occurredAt }) as BrokerageAgreementHistoryEntry;

const historyPage = (entries: BrokerageAgreementHistoryEntry[], page: number, totalElements: number): ApiResult<BrokerageAgreementHistory> => ({
  ok: true,
  status: 200,
  replayed: false,
  data: { entries, page, size: 50, totalElements },
});

const REJECTED_ENTRY = { ...entry("OWNER_REJECTED", 1, "2026-11-22T03:15:00Z"), actorType: "OWNER", actorName: null } as BrokerageAgreementHistoryEntry;
const CREATED_ENTRY = entry("CREATED", 1, "2026-11-20T03:15:00Z");
const OPENED_ENTRY = entry("DRAFT_OPENED", 2, "2026-11-23T03:15:00Z");

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDetailView agreementId={AGREEMENT_ID} />
    </NextIntlClientProvider>,
  );
}

const historyRegion = () => screen.getByRole("region", { name: h.title });
const historyEntries = () => within(historyRegion()).queryAllByRole("listitem");

describe("AgreementDetailView, the history section (brokerage-agreement E05-S7, S7-D12, UH-1, UH-2, E05S7-P10)", () => {
  beforeEach(() => {
    vi.mocked(getAgreement).mockReset();
    vi.mocked(openDraft).mockReset();
    vi.mocked(getAgreementHistory).mockReset();
  });

  it("agreementDetailView_historySection_collapsedAfterVersionsNoCall: the region History follows Versions, collapsed with Show history and no list, and nothing reads it", async () => {
    vi.mocked(getAgreement).mockResolvedValue(answered(DETAIL));
    renderView();

    await screen.findByRole("heading", { level: 1, name: m.title });
    const versions = screen.getByRole("region", { name: m.versions });
    const history = historyRegion();
    expect(versions.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(versions.contains(history)).toBe(false);
    expect(within(history).getByRole("button", { name: h.show })).toBeTruthy();
    expect(within(history).queryByRole("list")).toBeNull();
    expect(getAgreementHistory).not.toHaveBeenCalled();
    expect(getAgreement).toHaveBeenCalledTimes(1);
  });

  it("agreementDetailView_rereadAfterCommand_historyStaysOpenReadsPageZero: after a new draft the page reads the agreement again, the history stays open and reads page 0 again", async () => {
    vi.mocked(getAgreement).mockResolvedValueOnce(BEFORE).mockResolvedValueOnce(AFTER);
    vi.mocked(openDraft).mockResolvedValueOnce({ ok: true, status: 204, replayed: false, data: undefined });
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(historyPage([REJECTED_ENTRY, CREATED_ENTRY], 0, 2))
      .mockResolvedValueOnce(historyPage([OPENED_ENTRY, REJECTED_ENTRY, CREATED_ENTRY], 0, 3));
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: h.show }));
    expect(await within(historyRegion()).findByText("Declined by the owner")).toBeTruthy();
    expect(vi.mocked(getAgreementHistory).mock.calls.map((call) => call.slice(0, 2))).toEqual([[AGREEMENT_ID, { page: 0, size: 50 }]]);

    fireEvent.click(screen.getByRole("button", { name: en.BrokerageAgreement.newDraft.open }));

    // The reread replaces the page's sections: version 2 is the heading of the new versions list.
    expect(await screen.findByRole("heading", { level: 3, name: "Version 2" })).toBeTruthy();
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(getAgreement).toHaveBeenCalledTimes(2);
    expect(within(historyRegion()).getByRole("button", { name: h.hide })).toBeTruthy();
    expect(await within(historyRegion()).findByText("New draft opened")).toBeTruthy();
    expect(historyEntries()).toHaveLength(3);
    expect(vi.mocked(getAgreementHistory).mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [AGREEMENT_ID, { page: 0, size: 50 }],
      [AGREEMENT_ID, { page: 0, size: 50 }],
    ]);
  });

  it("agreementDetailView_rereadDuringOlder_newFirstPageOnly: a command while the older page loads shows the new first page, and the late older page adds nothing", async () => {
    let releaseOlder: (result: ApiResult<BrokerageAgreementHistory>) => void = () => undefined;
    vi.mocked(getAgreement).mockResolvedValueOnce(BEFORE).mockResolvedValueOnce(AFTER);
    vi.mocked(openDraft).mockResolvedValueOnce({ ok: true, status: 204, replayed: false, data: undefined });
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(historyPage([REJECTED_ENTRY], 0, 2))
      .mockReturnValueOnce(new Promise((resolve) => (releaseOlder = resolve)))
      .mockResolvedValueOnce(historyPage([OPENED_ENTRY], 0, 3));
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: h.show }));
    fireEvent.click(await within(historyRegion()).findByRole("button", { name: h.older }));
    fireEvent.click(screen.getByRole("button", { name: en.BrokerageAgreement.newDraft.open }));

    expect(await screen.findByRole("heading", { level: 3, name: "Version 2" })).toBeTruthy();
    expect(await within(historyRegion()).findByText("New draft opened")).toBeTruthy();
    await act(async () => releaseOlder(historyPage([CREATED_ENTRY], 1, 2)));

    expect(historyEntries()).toHaveLength(1);
    expect(within(historyRegion()).queryByText("Agreement drafted")).toBeNull();
    expect(within(historyRegion()).queryByText("Declined by the owner")).toBeNull();
    expect(vi.mocked(getAgreementHistory).mock.calls.map((call) => call[1])).toEqual([
      { page: 0, size: 50 },
      { page: 1, size: 50 },
      { page: 0, size: 50 },
    ]);
  });
});
