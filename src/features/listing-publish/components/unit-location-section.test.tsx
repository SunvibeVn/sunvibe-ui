import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingUnitLocation } from "../types";

// The edge only: the location call, so no request leaves the test.
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  openListingUnitLocation: vi.fn(),
}));

import { openListingUnitLocation } from "../services/review-api";

import { UnitLocationSection } from "./unit-location-section";

const l = en.ListingPublish.review.location;
const LISTING_ID = "01JG000000000000000000000L";

const LOCATION: ListingUnitLocation = {
  unitCode: "A-101",
  locationLabel: "Tầng 3, phòng cuối hành lang",
  street: "12 Đường Lê Lợi",
  wardName: "Phường Bến Thành",
};

const http = (status: number, code: string): ApiResult<ListingUnitLocation> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <UnitLocationSection listingId={LISTING_ID} revisionNo={2} />
    </NextIntlClientProvider>,
  );
}

const locationShown = () =>
  [LOCATION.locationLabel, LOCATION.street, l.label, l.street].some((text) => text !== null && screen.queryByText(text) !== null);

describe("UnitLocationSection (listing-publish US-4 AC-2, spec section 6, E06S4-D12)", () => {
  beforeEach(() => {
    vi.mocked(openListingUnitLocation).mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("unitLocationSection_click_showsLocationOnePost: nothing is read until the click; the click sends one POST, held while it runs, then shows the four fields", async () => {
    const answer = deferred<ApiResult<ListingUnitLocation>>();
    vi.mocked(openListingUnitLocation).mockReturnValueOnce(answer.promise);
    renderSection();

    expect(openListingUnitLocation).not.toHaveBeenCalled();
    expect(locationShown()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: l.show }));
    const opening = screen.getByRole("button", { name: l.opening }) as HTMLButtonElement;
    expect(opening.disabled).toBe(true);
    fireEvent.click(opening);
    expect(openListingUnitLocation).toHaveBeenCalledTimes(1);
    expect(openListingUnitLocation).toHaveBeenCalledWith(LISTING_ID, 2);

    answer.resolve({ ok: true, status: 200, replayed: false, data: LOCATION });
    expect(await screen.findByText("Tầng 3, phòng cuối hành lang")).toBeTruthy();
    for (const text of [l.unitCode, l.label, l.street, l.ward, "A-101", "12 Đường Lê Lợi", "Phường Bến Thành"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: l.show })).toBeNull();
    expect(openListingUnitLocation).toHaveBeenCalledTimes(1);
  });

  it("unitLocationSection_refused_sentenceNoLocation: each refusal shows its sentence and no location; a missing field reads 'Not given'", async () => {
    const rows: [ApiResult<ListingUnitLocation>, string][] = [
      [http(403, "FORBIDDEN"), l.forbidden],
      [http(403, "REVIEWER_NOT_INDEPENDENT"), l.forbidden],
      [http(409, "REVISION_NOT_PENDING"), l.notPending],
      [http(409, "LISTING_ARCHIVED"), l.archived],
      [http(404, "NOT_FOUND"), l.failed],
      [http(500, "INTERNAL_ERROR"), l.failed],
      [{ ok: false, kind: "network" }, l.failed],
    ];
    for (const [result, sentence] of rows) {
      vi.mocked(openListingUnitLocation).mockResolvedValueOnce(result);
      const { unmount } = renderSection();
      fireEvent.click(screen.getByRole("button", { name: l.show }));
      expect((await screen.findByRole("alert")).textContent).toBe(sentence);
      expect(locationShown()).toBe(false);
      // The button is offered again: a later click sends another request.
      expect(screen.getByRole("button", { name: l.show })).toBeTruthy();
      unmount();
    }

    vi.mocked(openListingUnitLocation).mockResolvedValueOnce({
      ok: true,
      status: 200,
      replayed: false,
      data: { unitCode: null, locationLabel: null, street: "12 Đường Lê Lợi", wardName: null },
    });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: l.show }));
    await waitFor(() => expect(screen.getAllByText(l.notGiven)).toHaveLength(3));
  });

  it("unitLocationSection_answer_notInStorageOrUrl: the answer is kept in the component only, never in storage or the address", async () => {
    vi.mocked(openListingUnitLocation).mockResolvedValueOnce({ ok: true, status: 200, replayed: false, data: LOCATION });
    const before = window.location.href;
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: l.show }));
    expect(await screen.findByText("12 Đường Lê Lợi")).toBeTruthy();

    const stored = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => `${storage.key(index)}=${storage.getItem(storage.key(index) ?? "")}`),
    );
    for (const value of [LOCATION.street, LOCATION.locationLabel, LOCATION.unitCode, LOCATION.wardName]) {
      expect(stored.some((entry) => entry.includes(value ?? ""))).toBe(false);
      expect(decodeURIComponent(window.location.href)).not.toContain(value);
    }
    expect(window.location.href).toBe(before);
  });
});
