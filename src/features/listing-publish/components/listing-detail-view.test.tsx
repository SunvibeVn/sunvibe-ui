import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingDetail } from "../types";

// The edge only: the listing read, so no request leaves the test.
vi.mock("../services/listing-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/listing-api")>()),
  getListing: vi.fn(),
}));

import { getListing } from "../services/listing-api";

import { ListingDetailView } from "./listing-detail-view";

const p = en.ListingPublish.page;
const LISTING_ID = "01JG000000000000000000000L";
const AGREEMENT_ID = "01JF000000000000000000000A";

/** The answer of spec section 4's example. */
const DETAIL: ListingDetail = {
  listingId: LISTING_ID,
  code: "TD-7K3M-Q9TX",
  state: "UNPUBLISHED",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  agreementId: AGREEMENT_ID,
  createdAt: "2026-11-20T03:15:00Z",
  dataVersion: 0,
  viewerIsAssignedSale: true,
  revisions: [{ revisionNo: 1, status: "DRAFT", createdAt: "2026-11-20T03:15:00Z" }],
  hasOlderRevisions: false,
};

const answered = (data: ListingDetail): ApiResult<ListingDetail> => ({ ok: true, status: 200, replayed: false, data });
const failed = (status: number, code: string): ApiResult<ListingDetail> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ListingDetailView listingId={LISTING_ID} />
    </NextIntlClientProvider>,
  );
}

describe("ListingDetailView (listing-publish E06-S1, spec section 6, UL-3)", () => {
  beforeEach(() => {
    vi.mocked(getListing).mockReset();
  });

  it("listingDetailView_ready_fieldsRevisionsAndNotPublic: the code, state, transaction, created time, agreement link, revisions newest first and the not-public line", async () => {
    vi.mocked(getListing).mockResolvedValueOnce(
      answered({
        ...DETAIL,
        revisions: [
          { revisionNo: 2, status: "PENDING_REVIEW", createdAt: "2026-11-21T03:15:00Z" },
          { revisionNo: 1, status: "DRAFT", createdAt: "2026-11-20T03:15:00Z" },
        ],
      }),
    );
    renderView();

    expect(await screen.findByRole("heading", { level: 1, name: "Listing TD-7K3M-Q9TX" })).toBeTruthy();
    for (const label of [p.state, p.transaction, p.created]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Unpublished")).toBeTruthy();
    expect(screen.getByText("Long-term rental")).toBeTruthy();
    expect(screen.getByText(/^Nov 20, 2026/).textContent).toMatch(/10:15/);
    expect(screen.getByRole("link", { name: p.openAgreement }).getAttribute("href")).toBe(
      `/workspace/brokerage-agreements/${AGREEMENT_ID}`,
    );

    const revisions = screen.getByRole("region", { name: p.revisions });
    const [newest, first] = within(revisions).getAllByRole("listitem") as HTMLElement[];
    expect(within(newest as HTMLElement).getByText("Revision 2")).toBeTruthy();
    expect(within(newest as HTMLElement).getByText("Pending review")).toBeTruthy();
    expect(within(newest as HTMLElement).getByText(/^created Nov 21, 2026/).textContent).toMatch(/10:15/);
    expect(within(first as HTMLElement).getByText("Revision 1")).toBeTruthy();
    expect(within(first as HTMLElement).getByText("Draft")).toBeTruthy();
    expect(within(first as HTMLElement).getByText(/^created Nov 20, 2026/).textContent).toMatch(/10:15/);
    expect(screen.getByText(p.notPublic)).toBeTruthy();
    expect(screen.queryByText(p.olderRevisions)).toBeNull();
    // No unit, owner or person: the internal ids are not shown.
    for (const id of [DETAIL.unitId, AGREEMENT_ID, LISTING_ID]) expect(screen.queryByText(new RegExp(id))).toBeNull();
    expect(getListing).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getListing).mock.calls[0]?.[0]).toBe(LISTING_ID);
  });

  it("listingDetailView_olderRevisions_olderLine: hasOlderRevisions adds the older line", async () => {
    vi.mocked(getListing).mockResolvedValueOnce(answered({ ...DETAIL, hasOlderRevisions: true }));
    renderView();

    expect(await screen.findByText(p.olderRevisions)).toBeTruthy();
    expect(screen.getByRole("region", { name: p.revisions }).contains(screen.getByText(p.olderRevisions))).toBe(true);
  });

  it("listingDetailView_loadingNotFoundError_states: the loading line, the 404 text, the error with Try again reading again, and nothing for a session answer", async () => {
    const answer = deferred<ApiResult<ListingDetail>>();
    vi.mocked(getListing).mockReturnValueOnce(answer.promise);
    let view = renderView();

    expect(screen.getByRole("status").textContent).toBe(p.loading);
    answer.resolve(failed(404, "NOT_FOUND"));
    expect(await screen.findByText(p.notFound)).toBeTruthy();
    expect(screen.queryByText(p.loading)).toBeNull();
    expect(screen.queryByRole("button", { name: p.retry })).toBeNull();
    view.unmount();

    vi.mocked(getListing).mockResolvedValueOnce(failed(500, "INTERNAL_ERROR")).mockResolvedValueOnce(answered(DETAIL));
    view = renderView();
    expect(await screen.findByText(p.loadFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: p.retry }));
    expect(await screen.findByRole("heading", { level: 1, name: "Listing TD-7K3M-Q9TX" })).toBeTruthy();
    expect(screen.queryByText(p.loadFailed)).toBeNull();
    expect(getListing).toHaveBeenCalledTimes(3);
    view.unmount();

    vi.mocked(getListing).mockResolvedValueOnce({ ok: false, kind: "signed-out" });
    const { container } = renderView();
    await waitFor(() => expect(getListing).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
