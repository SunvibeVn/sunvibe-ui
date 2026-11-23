import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingLiveDifference, ListingLiveRevision } from "../types";

// The edge only: the live difference read, so no request leaves the test.
vi.mock("../services/publication-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/publication-api")>()),
  getListingRevisionLiveDifference: vi.fn(),
}));

import { getListingRevisionLiveDifference } from "../services/publication-api";

import { LiveDifferenceSection } from "./live-difference-section";

const l = en.ListingPublish.liveDifference;
const LISTING_ID = "01JG000000000000000000000L";

const LIVE: ListingLiveRevision = {
  revisionNo: 2,
  wentLiveAt: "2026-11-22T03:00:00Z",
  title: '<b>Rẻ</b> <a href="https://example.com">xem</a>',
  description: "<img src=x onerror=alert(1)>\nGần chợ.",
  features: {
    furnishing: null,
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: null,
    balcony: false,
    elevator: false,
    motorbikeParking: false,
    carParking: false,
    internet: false,
    pets: null,
    noSharedLandlord: false,
  },
  terms: {
    source: "IN_EFFECT",
    pendingStartDate: null,
    capturedAt: "2026-11-21T02:00:00Z",
    terms: {
      monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
      deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
      minimumTermMonths: 6,
      paymentPeriodMonths: 1,
      mandatoryFees: [],
    },
  },
};

const ok = (data: ListingLiveDifference): ApiResult<ListingLiveDifference> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<ListingLiveDifference> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });
const compared = (changedParts: ListingLiveDifference["changedParts"]) => ok({ revisionNo: 3, comparison: "COMPARED", live: LIVE, changedParts });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function element(rereadAttempt: number) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <LiveDifferenceSection listingId={LISTING_ID} revisionNo={3} rereadAttempt={rereadAttempt} />
    </NextIntlClientProvider>
  );
}

function renderSection(rereadAttempt = 0) {
  const view = render(element(rereadAttempt));
  return { ...view, rerenderWith: (next: number) => view.rerender(element(next)) };
}

const region = () => screen.getByRole("region", { name: l.title });

describe("LiveDifferenceSection (listing-publish US-4 AC-2, spec section 6, E06S6-D12, D13)", () => {
  beforeEach(() => {
    vi.mocked(getListingRevisionLiveDifference).mockReset();
  });

  it("liveDifferenceSection_compared_changedPartsAndLiveValuesAsText: the live revision and its time, the changed parts in the answer's order, and each changed part's live value as text only; no change says so", async () => {
    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(compared(["TITLE", "DESCRIPTION", "TERMS"]));
    const view = renderSection();

    expect(await within(region()).findByText(/^Live revision 2, live since Nov 22, 2026, 10:00\sAM\.$/)).toBeTruthy();
    expect(getListingRevisionLiveDifference).toHaveBeenCalledWith(LISTING_ID, 3);
    expect(within(region()).getByText("Changed: Title, Description, Terms")).toBeTruthy();
    expect(within(region()).getByText(LIVE.title)).toBeTruthy();
    expect(within(region()).getByText((_, node) => node?.textContent === LIVE.description && node.tagName === "DD")).toBeTruthy();
    expect(within(region()).getByText("Rent: 4,500,000 VND / month")).toBeTruthy();
    // The features did not change: their live value is not shown.
    expect(within(region()).queryByText("Air conditioner")).toBeNull();
    expect(region().querySelector("b, a, img")).toBeNull();
    view.unmount();

    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(compared(["FEATURES"]));
    const features = renderSection();
    expect(await within(region()).findByText("Changed: Features")).toBeTruthy();
    expect(within(region()).getByText("Air conditioner")).toBeTruthy();
    expect(within(region()).queryByText(LIVE.title)).toBeNull();
    features.unmount();

    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(compared([]));
    renderSection();
    expect(await within(region()).findByText(l.noChange)).toBeTruthy();
    expect(within(region()).queryByText(/^Changed:/)).toBeNull();
  });

  it("liveDifferenceSection_noLiveAndIsLive_sentences: no live revision and the asked revision being the live one each say so", async () => {
    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(ok({ revisionNo: 3, comparison: "NO_LIVE_REVISION", live: null, changedParts: [] }));
    const view = renderSection();
    expect(await within(region()).findByText(l.noLive)).toBeTruthy();
    view.unmount();

    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(ok({ revisionNo: 3, comparison: "IS_LIVE_REVISION", live: null, changedParts: [] }));
    renderSection();
    expect(await within(region()).findByText(l.isLive)).toBeTruthy();
    expect(region().textContent).toBe(`${l.title}${l.isLive}`);
  });

  it("liveDifferenceSection_rereadAttempt_readsAgainWithoutLoading: each re-read of the page reads again in place, keeping what it shows; after an approval that put the asked revision live it says so without a loading state", async () => {
    const reread = deferred<ApiResult<ListingLiveDifference>>();
    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(compared(["TITLE"])).mockReturnValueOnce(reread.promise);
    const { rerenderWith } = renderSection();
    expect(await within(region()).findByText("Changed: Title")).toBeTruthy();

    rerenderWith(1);
    await waitFor(() => expect(getListingRevisionLiveDifference).toHaveBeenCalledTimes(2));
    expect(within(region()).queryByRole("status")).toBeNull();
    expect(within(region()).getByText("Changed: Title")).toBeTruthy();

    reread.resolve(ok({ revisionNo: 3, comparison: "IS_LIVE_REVISION", live: null, changedParts: [] }));
    expect(await within(region()).findByText(l.isLive)).toBeTruthy();
    expect(within(region()).queryByText("Changed: Title")).toBeNull();
    expect(within(region()).queryByRole("status")).toBeNull();
  });

  it("liveDifferenceSection_error_retryLine: loading, then a failed read says so with Try again, which reads again; nothing at all for the one 404", async () => {
    const first = deferred<ApiResult<ListingLiveDifference>>();
    vi.mocked(getListingRevisionLiveDifference).mockReturnValueOnce(first.promise).mockResolvedValueOnce(compared([]));
    const view = renderSection();

    expect(within(region()).getByRole("status").textContent).toBe(l.loading);
    first.resolve(http(500, "INTERNAL_ERROR"));
    expect(await within(region()).findByText(l.loadError)).toBeTruthy();
    fireEvent.click(within(region()).getByRole("button", { name: en.ListingPublish.review.retry }));
    expect(await within(region()).findByText(l.noChange)).toBeTruthy();
    expect(getListingRevisionLiveDifference).toHaveBeenCalledTimes(2);
    view.unmount();

    vi.mocked(getListingRevisionLiveDifference).mockResolvedValueOnce(http(404, "NOT_FOUND"));
    const { container } = renderSection();
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
