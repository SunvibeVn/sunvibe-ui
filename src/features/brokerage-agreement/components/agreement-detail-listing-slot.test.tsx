import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
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

import { getAgreement, suspendAgreement } from "../services/agreement-api";

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
const SLOT = "Listing slot";

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

const answered = (data: BrokerageAgreementDetail): ApiResult<BrokerageAgreementDetail> => ({ ok: true, status: 200, replayed: false, data });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/** The slot's stand-in: a region that counts its mounts, as the listing section mounts and reads once per mount. */
let mounts = 0;
function CountingSlot() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <section aria-label={SLOT} />;
}

function renderView(belowAdvertising?: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDetailView agreementId={AGREEMENT_ID} belowAdvertising={belowAdvertising} />
    </NextIntlClientProvider>,
  );
}

/** A region's accessible name: its aria-label, or the text of the element its aria-labelledby names. */
function regionName(region: HTMLElement): string | null {
  const labelledBy = region.getAttribute("aria-labelledby");
  return region.getAttribute("aria-label") ?? (labelledBy === null ? null : document.getElementById(labelledBy)?.textContent ?? null);
}

const follows = (first: HTMLElement, second: HTMLElement) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("AgreementDetailView, the slot below the advertising panel (listing-publish E06-S1, E06S1-D12, UL-4)", () => {
  beforeEach(() => {
    vi.mocked(getAgreement).mockReset();
    vi.mocked(suspendAgreement).mockReset();
    mounts = 0;
  });

  it("agreementDetailView_slot_afterAdvertisingReadyOnly: absent while the detail loads; once ready it follows the Advertising region and precedes the stop and versions sections", async () => {
    const detail = deferred<ApiResult<BrokerageAgreementDetail>>();
    vi.mocked(getAgreement).mockReturnValueOnce(detail.promise);
    renderView(<CountingSlot />);

    expect(screen.getByRole("status").textContent).toBe(b.detail.loading);
    expect(screen.queryByRole("region", { name: SLOT })).toBeNull();
    expect(mounts).toBe(0);
    detail.resolve(answered(ACTIVE));

    const slot = await screen.findByRole("region", { name: SLOT });
    const advertising = screen.getByRole("region", { name: b.advertising.title });
    const stop = screen.getByRole("region", { name: "Agreement state" });
    const versions = screen.getByRole("region", { name: b.detail.versions });
    expect(follows(advertising, slot)).toBe(true);
    expect(follows(slot, stop)).toBe(true);
    expect(follows(slot, versions)).toBe(true);
    expect(advertising.contains(slot)).toBe(false);
    await waitFor(() => expect(mounts).toBe(1));
  });

  it("agreementDetailView_reread_slotRemounted: a command's reread unmounts the slot while the detail loads and mounts it again with the new detail", async () => {
    const second = deferred<ApiResult<BrokerageAgreementDetail>>();
    vi.mocked(getAgreement).mockResolvedValueOnce(answered(ACTIVE)).mockReturnValueOnce(second.promise);
    vi.mocked(suspendAgreement).mockResolvedValueOnce({ ok: true, status: 204, replayed: false, data: undefined });
    renderView(<CountingSlot />);

    await screen.findByRole("region", { name: SLOT });
    await waitFor(() => expect(mounts).toBe(1));
    fireEvent.click(within(await screen.findByRole("region", { name: "Agreement state" })).getByRole("button", { name: "Suspend" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Reason"), { target: { value: "COMPLAINT" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Suspend" }));

    await waitFor(() => expect(getAgreement).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region", { name: SLOT })).toBeNull();
    second.resolve(answered(SUSPENDED));

    expect(await screen.findByText(/^Suspended since /)).toBeTruthy();
    expect(screen.getByRole("region", { name: SLOT })).toBeTruthy();
    await waitFor(() => expect(mounts).toBe(2));
  });

  it("agreementDetailView_noSlot_sameRegions: without the prop the page has the regions of the base render, in its order", async () => {
    vi.mocked(getAgreement).mockResolvedValueOnce(answered(ACTIVE));
    renderView();

    await screen.findByRole("region", { name: "Agreement state" });
    expect(screen.getAllByRole("region").map(regionName)).toEqual(["Advertising", "Agreement state", "Versions", "History"]);
  });
});
