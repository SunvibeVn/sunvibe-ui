import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingReconfirmationItem, ListingReconfirmations } from "../types";

// The edge only: the list read, so no request leaves the test.
vi.mock("../services/freshness-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/freshness-api")>()),
  getListingReconfirmations: vi.fn(),
}));

import { getListingReconfirmations } from "../services/freshness-api";

import { ReconfirmationListView } from "./reconfirmation-list-view";

const c = en.ListingPublish.reconfirmations;

/** A paused listing past its last valid day whose latest contact is not a valid confirmation. */
const PAUSED_ROW: ListingReconfirmationItem = {
  listingId: "01JG000000000000000000000A",
  code: "TD-7K3M-Q9TX",
  state: "PAUSED",
  confirmedOn: "2027-03-01",
  reconfirmFrom: "2027-03-11",
  validThrough: "2027-03-15",
  deadlinePassed: true,
  latestRecordValid: false,
};
/** An unpublished listing to reconfirm, still before its last valid day. */
const UNPUBLISHED_ROW: ListingReconfirmationItem = {
  listingId: "01JG000000000000000000000B",
  code: "TD-8P2Q-R4ST",
  state: "UNPUBLISHED",
  confirmedOn: "2027-03-04",
  reconfirmFrom: "2027-03-14",
  validThrough: "2027-03-18",
  deadlinePassed: false,
  latestRecordValid: true,
};

const answered = (data: ListingReconfirmations): ApiResult<ListingReconfirmations> => ({ ok: true, status: 200, replayed: false, data });
const failed = (status: number, code: string): ApiResult<ListingReconfirmations> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ReconfirmationListView />
    </NextIntlClientProvider>,
  );
}

const rows = () => screen.queryAllByRole("listitem");

describe("ReconfirmationListView (listing-publish US-6 AC-3, spec section 6, E06S3-D7, D13)", () => {
  beforeEach(() => {
    vi.mocked(getListingReconfirmations).mockReset();
  });

  it("reconfirmationListView_states_loadingErrorEmptyForbidden: loading, an error with Try again reading again, the empty list and the 403", async () => {
    const first = deferred<ApiResult<ListingReconfirmations>>();
    vi.mocked(getListingReconfirmations).mockReturnValueOnce(first.promise).mockResolvedValueOnce(answered({ items: [], hasMore: false }));
    const view = renderView();

    expect(screen.queryByRole("status")?.textContent).toBe(c.loading);
    first.resolve(failed(500, "INTERNAL_ERROR"));
    await waitFor(() =>
      expect([screen.queryByText(c.loadFailed) !== null, screen.queryByRole("button", { name: c.retry }) !== null]).toEqual([true, true]),
    );
    fireEvent.click(screen.getByRole("button", { name: c.retry }));
    await waitFor(() => expect(getListingReconfirmations).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(c.empty)).not.toBeNull());
    view.unmount();

    vi.mocked(getListingReconfirmations).mockResolvedValueOnce(failed(403, "FORBIDDEN"));
    renderView();
    await waitFor(() => expect(screen.queryByText(c.forbidden)).not.toBeNull());
  });

  it("reconfirmationListView_rows_linkStateDatesBadgeAndHasMore: each row links its code to the listing page, with its state, its three dates, 'Expired' and the not-valid line when they hold, and the hasMore sentence", async () => {
    vi.mocked(getListingReconfirmations).mockResolvedValueOnce(answered({ items: [PAUSED_ROW, UNPUBLISHED_ROW], hasMore: true }));
    renderView();

    await waitFor(() =>
      expect(
        [PAUSED_ROW, UNPUBLISHED_ROW].map((row) => screen.queryByRole("link", { name: row.code })?.getAttribute("href")),
      ).toEqual([`/workspace/listings/${PAUSED_ROW.listingId}`, `/workspace/listings/${UNPUBLISHED_ROW.listingId}`]),
    );
    const [first, second] = rows() as [HTMLElement, HTMLElement];
    expect([within(first).queryByText("Paused") !== null, within(second).queryByText("Unpublished") !== null]).toEqual([true, true]);
    const dates: [HTMLElement, string][] = [
      [first, "Confirmed Mar 1, 2027"],
      [first, "Reconfirm from Mar 11, 2027"],
      [first, "Valid through Mar 15, 2027"],
      [second, "Confirmed Mar 4, 2027"],
      [second, "Reconfirm from Mar 14, 2027"],
      [second, "Valid through Mar 18, 2027"],
    ];
    expect(dates.filter(([row, text]) => within(row).queryByText(text) === null).map(([, text]) => text)).toEqual([]);
    expect(within(first).queryByText(c.expired)).not.toBeNull();
    expect(within(first).queryByText(c.notValid)).not.toBeNull();
    expect(screen.queryByText(c.hasMore)).not.toBeNull();
    expect(within(second).queryByText(c.expired)).toBeNull();
    expect(within(second).queryByText(c.notValid)).toBeNull();
  });
});
