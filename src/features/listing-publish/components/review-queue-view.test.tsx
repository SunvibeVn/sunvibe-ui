import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingReviewQueue, ListingReviewQueueItem } from "../types";

// The edge only: the queue read, so no request leaves the test.
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  getListingReviewQueue: vi.fn(),
}));

import { getListingReviewQueue } from "../services/review-api";

import { ReviewQueueView } from "./review-queue-view";

const q = en.ListingPublish.reviews;
const ineligible = en.ListingPublish.review.ineligible;

const REVIEWABLE: ListingReviewQueueItem = {
  listingId: "01JG000000000000000000000L",
  code: "TD-7K3M-Q9TX",
  revisionNo: 2,
  submittedAt: "2026-11-21T03:00:00Z",
  title: "Phòng trọ gần trường đại học",
  unit: {
    assetType: "HOUSE",
    provinceCode: "79",
    provinceName: "Thành phố Hồ Chí Minh",
    wardCode: "26734",
    wardName: "Phường Bến Thành",
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 25.5,
  },
  viewerMayReview: true,
  notEligibleReasons: [],
};
const OWN: ListingReviewQueueItem = {
  ...REVIEWABLE,
  listingId: "01JG000000000000000000000M",
  code: "TD-8P2Q-R4ST",
  revisionNo: 1,
  submittedAt: "2026-11-21T04:00:00Z",
  title: "Căn hộ một phòng ngủ",
  viewerMayReview: false,
  notEligibleReasons: ["AUTHOR", "ASSIGNED_SALE"],
};

const answered = (data: ListingReviewQueue): ApiResult<ListingReviewQueue> => ({ ok: true, status: 200, replayed: false, data });
const failed = (status: number, code: string): ApiResult<ListingReviewQueue> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ReviewQueueView />
    </NextIntlClientProvider>,
  );
}

const rowOf = (code: string) => screen.getByRole("row", { name: new RegExp(code) });

describe("ReviewQueueView (listing-publish US-4 AC-1, spec section 6, E06S4-D10, D17)", () => {
  beforeEach(() => {
    vi.mocked(getListingReviewQueue).mockReset();
  });

  it("reviewQueueView_states_loadingErrorForbiddenEmpty: loading, an error with Try again reading again, the empty queue and the 403", async () => {
    const first = deferred<ApiResult<ListingReviewQueue>>();
    vi.mocked(getListingReviewQueue).mockReturnValueOnce(first.promise).mockResolvedValueOnce(answered({ items: [], hasMore: false }));
    const view = renderView();

    expect(screen.getByRole("heading", { level: 1, name: q.title })).toBeTruthy();
    expect(screen.queryByRole("status")?.textContent).toBe(q.loading);
    first.resolve(failed(500, "INTERNAL_ERROR"));
    await waitFor(() =>
      expect([screen.queryByText(q.loadFailed) !== null, screen.queryByRole("button", { name: q.retry }) !== null]).toEqual([true, true]),
    );
    fireEvent.click(screen.getByRole("button", { name: q.retry }));
    expect(await screen.findByText(q.empty)).toBeTruthy();
    expect(getListingReviewQueue).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("table")).toBeNull();
    view.unmount();

    vi.mocked(getListingReviewQueue).mockResolvedValueOnce(failed(403, "FORBIDDEN"));
    renderView();
    expect(await screen.findByText(q.forbidden)).toBeTruthy();
    expect(screen.queryByRole("button", { name: q.retry })).toBeNull();
  });

  it("reviewQueueView_rows_reviewLinkOrReasons: each row shows its code, revision, time, title and unit; Review is a link to the review page, or the reasons the viewer may not review", async () => {
    vi.mocked(getListingReviewQueue).mockResolvedValueOnce(answered({ items: [REVIEWABLE, OWN], hasMore: false }));
    renderView();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      q.columns.code,
      q.columns.revision,
      q.columns.submitted,
      q.columns.title,
      q.columns.unit,
      q.columns.review,
    ]);
    const reviewable = rowOf("TD-7K3M-Q9TX");
    expect(within(reviewable).getByText("Phòng trọ gần trường đại học")).toBeTruthy();
    expect(within(reviewable).getByText("2")).toBeTruthy();
    // Vietnam time: 03:00 UTC is 10:00 there (the space before AM may be a narrow one).
    expect(within(reviewable).getByText(/^Nov 21, 2026, 10:00\sAM$/)).toBeTruthy();
    expect(within(reviewable).getByText("House · Phường Bến Thành, Thành phố Hồ Chí Minh · 2 bedrooms, 1 bathroom · 25.5 m²")).toBeTruthy();
    const link = within(reviewable).getByRole("link", { name: q.reviewLink });
    expect(link.getAttribute("href")).toBe("/workspace/listings/01JG000000000000000000000L/revisions/2/review");
    expect(within(reviewable).queryByText(q.notEligible)).toBeNull();

    const own = rowOf("TD-8P2Q-R4ST");
    expect(within(own).queryByRole("link")).toBeNull();
    expect(within(own).getByText(q.notEligible)).toBeTruthy();
    expect(within(own).getAllByRole("listitem").map((item) => item.textContent)).toEqual([ineligible.AUTHOR, ineligible.ASSIGNED_SALE]);
    expect(screen.queryByText(q.hasMore)).toBeNull();
  });

  it("reviewQueueView_hasMore_sentence: when more revisions wait than are answered the page says so, also with no row", async () => {
    vi.mocked(getListingReviewQueue).mockResolvedValueOnce(answered({ items: [REVIEWABLE], hasMore: true }));
    const view = renderView();
    expect(await screen.findByText(q.hasMore)).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    view.unmount();

    vi.mocked(getListingReviewQueue).mockResolvedValueOnce(answered({ items: [], hasMore: true }));
    renderView();
    expect(await screen.findByText(q.hasMore)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(q.empty)).toBeNull();
  });

  it("reviewQueueView_title_textOnly: a title holding markup and a web address is shown as text, with no element or link of its own", async () => {
    const title = '<b>Rẻ</b> <a href="https://example.com">xem</a> https://example.com';
    vi.mocked(getListingReviewQueue).mockResolvedValueOnce(answered({ items: [{ ...REVIEWABLE, title }], hasMore: false }));
    renderView();

    await screen.findByRole("table");
    const row = rowOf("TD-7K3M-Q9TX");
    expect(within(row).getByText(title)).toBeTruthy();
    expect(row.querySelector("b")).toBeNull();
    expect(within(row).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/workspace/listings/01JG000000000000000000000L/revisions/2/review",
    ]);
  });
});
