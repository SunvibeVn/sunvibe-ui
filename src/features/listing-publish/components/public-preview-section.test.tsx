import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingPublicPreview } from "../types";

// The edge only: the preview read, so no request leaves the test.
vi.mock("../services/publication-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/publication-api")>()),
  getListingRevisionPublicPreview: vi.fn(),
}));

import { getListingRevisionPublicPreview } from "../services/publication-api";

import { PublicPreviewSection } from "./public-preview-section";

const v = en.ListingPublish.preview;
const LISTING_ID = "01JG000000000000000000000L";

/** A revision pending review: its unit snapshot with the place's names, its terms, and markup typed in its texts. */
const PENDING: ListingPublicPreview = {
  revisionNo: 3,
  revisionStatus: "PENDING_REVIEW",
  code: "TD-ABCD-EFGH",
  transactionType: "LONG_TERM_RENT",
  propertyType: "HOUSE",
  provinceCode: "48",
  provinceName: "Thành phố Đà Nẵng",
  wardCode: "20194",
  wardName: "Phường Hải Châu",
  bedrooms: 3,
  bathrooms: 2,
  areaSqm: 80,
  terms: {
    monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
    deposit: { basis: "AMOUNT", months: null, amount: 0, currency: "VND" },
    minimumTermMonths: 12,
    paymentPeriodMonths: 3,
    mandatoryFees: [{ name: "Nước", basis: "INCLUDED", amount: null, chargeUnit: null, currency: null }],
  },
  title: "Nhà <i>nguyên căn</i> gần biển",
  description: "Nhà rộng.\n<b>bold</b> https://example.test",
  features: {
    furnishing: null,
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: null,
    balcony: true,
    elevator: false,
    motorbikeParking: false,
    carParking: false,
    internet: false,
    pets: null,
    noSharedLandlord: false,
  },
  liveOn: null,
  lastConfirmedOn: "2026-11-21",
};

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<never> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderSection(revisionNo = 3) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <PublicPreviewSection listingId={LISTING_ID} revisionNo={revisionNo} />
    </NextIntlClientProvider>,
  );
}

const region = () => screen.getByRole("region", { name: v.title });
const button = (name: string) => within(region()).getByRole("button", { name });
/** The data block's terms and descriptions, in order. */
const terms = () => Array.from(region().querySelectorAll("dt")).map((term) => term.textContent);
const definition = (label: string) => {
  const term = Array.from(region().querySelectorAll("dt")).find((entry) => entry.textContent === label);
  const value = term?.nextElementSibling;
  if (value === null || value === undefined || value.tagName !== "DD") throw new Error(`no value for ${label}`);
  return value as HTMLElement;
};

describe("PublicPreviewSection (listing-publish US-2 AC-3, spec section 6, E06S7-D16 (a), PB-22)", () => {
  beforeEach(() => {
    vi.mocked(getListingRevisionPublicPreview).mockReset();
  });

  it("publicPreviewSection_states_idleLoadingErrorRetry: its own heading naming a region; nothing read before 'Show the public preview'; loading; the error with Try again reading again", async () => {
    const first = deferred<ApiResult<ListingPublicPreview>>();
    vi.mocked(getListingRevisionPublicPreview).mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(PENDING));
    renderSection();

    expect(within(region()).getByRole("heading", { level: 2, name: v.title })).toBeTruthy();
    expect(getListingRevisionPublicPreview).not.toHaveBeenCalled();
    expect(region().querySelector("dl")).toBeNull();

    fireEvent.click(button(v.show));
    expect(within(region()).getByRole("status").textContent).toBe(v.loading);
    expect(getListingRevisionPublicPreview).toHaveBeenCalledWith(LISTING_ID, 3);

    first.resolve(http(500, "INTERNAL_ERROR"));
    expect(await within(region()).findByText(v.loadError)).toBeTruthy();
    fireEvent.click(button(en.ListingPublish.page.retry));
    expect(await within(region()).findByText("TD-ABCD-EFGH")).toBeTruthy();
    expect(getListingRevisionPublicPreview).toHaveBeenCalledTimes(2);
    expect(within(region()).queryByText(v.loadError)).toBeNull();
  });

  it("publicPreviewSection_data_descriptionListInOrder: the groups as a description list in the order of spec section 6, the place's names with their codes, the terms and features as text", async () => {
    vi.mocked(getListingRevisionPublicPreview).mockResolvedValueOnce(ok(PENDING));
    renderSection();
    fireEvent.click(button(v.show));
    await within(region()).findByText("TD-ABCD-EFGH");

    const l = v.labels;
    expect(terms()).toEqual([
      l.code,
      l.rental,
      l.type,
      l.place,
      l.bedrooms,
      l.bathrooms,
      l.area,
      l.terms,
      l.title,
      l.description,
      l.features,
      l.liveOn,
      l.lastConfirmed,
    ]);
    expect(definition(l.rental).textContent).toBe("Long-term rental");
    expect(definition(l.type).textContent).toBe("House");
    expect(definition(l.place).textContent).toBe("Phường Hải Châu (20194), Thành phố Đà Nẵng (48)");
    expect(definition(l.bedrooms).textContent).toBe("3");
    expect(definition(l.area).textContent).toBe("80");
    expect(within(definition(l.terms)).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Rent: 8,000,000 VND / month",
      "No deposit",
      "Minimum term: 12 months",
      "Pay every 3 months",
      "Nước: included in the rent",
    ]);
    expect(within(definition(l.features)).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Air conditioner", "Balcony"]);
    expect(definition(l.liveOn).textContent).toBe(v.notLive);
    expect(definition(l.lastConfirmed).textContent).toBe("Nov 21, 2026");
  });

  it("publicPreviewSection_texts_asTypedNeverHtmlOrLink: the title and description show as typed, the description keeps its line breaks, and no markup or address becomes an element", async () => {
    vi.mocked(getListingRevisionPublicPreview).mockResolvedValueOnce(ok(PENDING));
    renderSection();
    fireEvent.click(button(v.show));
    await within(region()).findByText("TD-ABCD-EFGH");

    // No markup or address becomes an element.
    expect(region().querySelector("b")).toBeNull();
    expect(region().querySelector("i")).toBeNull();
    expect(region().querySelector("a")).toBeNull();
    expect(definition(v.labels.title).textContent).toBe("Nhà <i>nguyên căn</i> gần biển");
    const description = definition(v.labels.description);
    expect(description.textContent).toBe("Nhà rộng.\n<b>bold</b> https://example.test");
    expect(description.className).toContain("whitespace-pre-line");
  });

  it("publicPreviewSection_draft_unitSentenceNoTerms: a Draft never submitted shows the unit sentence, 'No terms snapshot yet.' and its unwritten texts", async () => {
    const draft: ListingPublicPreview = {
      ...PENDING,
      revisionStatus: "DRAFT",
      propertyType: null,
      provinceCode: null,
      provinceName: null,
      wardCode: null,
      wardName: null,
      bedrooms: null,
      bathrooms: null,
      areaSqm: null,
      terms: null,
      description: null,
      lastConfirmedOn: null,
    };
    vi.mocked(getListingRevisionPublicPreview).mockResolvedValueOnce(ok(draft));
    renderSection();
    fireEvent.click(button(v.show));
    await within(region()).findByText("TD-ABCD-EFGH");

    expect(definition(v.labels.unit).textContent).toBe(v.noUnit);
    expect(terms()).not.toContain(v.labels.place);
    expect(definition(v.labels.terms).textContent).toBe(en.ListingPublish.revision.terms.none);
    expect(definition(v.labels.description).textContent).toBe(en.ListingPublish.revision.notWritten);
    expect(definition(v.labels.lastConfirmed).textContent).toBe(v.noConfirmation);
  });

  it("publicPreviewSection_readAgain_readsAgain: 'Read again' reads the preview again and shows the new answer", async () => {
    vi.mocked(getListingRevisionPublicPreview)
      .mockResolvedValueOnce(ok(PENDING))
      .mockResolvedValueOnce(ok({ ...PENDING, title: "Nhà mới sửa" }));
    renderSection();
    fireEvent.click(button(v.show));
    await within(region()).findByText("TD-ABCD-EFGH");

    fireEvent.click(button(v.readAgain));
    expect(await within(region()).findByText("Nhà mới sửa")).toBeTruthy();
    expect(getListingRevisionPublicPreview).toHaveBeenCalledTimes(2);
    expect(getListingRevisionPublicPreview).toHaveBeenLastCalledWith(LISTING_ID, 3);
  });

  it("publicPreviewSection_notFoundOrSession_nothing: the one 404 and each session answer show nothing", async () => {
    for (const answer of [http(404, "NOT_FOUND"), { ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingPublicPreview>[]) {
      vi.mocked(getListingRevisionPublicPreview).mockResolvedValueOnce(answer);
      const { container, unmount } = renderSection();
      fireEvent.click(button(v.show));
      await waitFor(() => expect(container.textContent).toBe(""));
      unmount();
    }
  });
});
