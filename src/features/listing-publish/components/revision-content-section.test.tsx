import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { revisionPanelModel, type RevisionScreen } from "../lib/revision-model";
import type { ListingRevisionDetail } from "../types";

import { RevisionContentSection } from "./revision-content-section";

const r = en.ListingPublish.revision;

/** A Pending review revision as the read answers it. */
const PENDING: ListingRevisionDetail = {
  listingId: "01JG000000000000000000000L",
  revisionNo: 1,
  status: "PENDING_REVIEW",
  createdAt: "2026-11-20T03:15:00Z",
  updatedAt: "2026-11-21T03:15:00Z",
  title: "Phòng trọ gần trường đại học",
  description: "Phòng rộng.\nGần chợ.",
  features: {
    furnishing: "BASIC",
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: "PRIVATE",
    balcony: false,
    elevator: false,
    motorbikeParking: false,
    carParking: false,
    internet: false,
    pets: null,
    noSharedLandlord: false,
  },
  termsSnapshot: {
    source: "IN_EFFECT",
    pendingStartDate: null,
    capturedAt: "2026-11-21T02:00:00Z",
    terms: {
      monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
      deposit: { basis: "AMOUNT", months: null, amount: 0, currency: "VND" },
      minimumTermMonths: 6,
      paymentPeriodMonths: 3,
      mandatoryFees: [],
    },
  },
  unitSnapshot: {
    assetType: "APARTMENT",
    provinceCode: "79",
    provinceName: "Thành phố Hồ Chí Minh",
    wardCode: "26734",
    wardName: "Phường Bến Thành",
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 25.5,
  },
  submittedAt: "2026-11-21T03:00:00Z",
  dataVersion: 6,
  problems: [],
};

function screenOf(detail: ListingRevisionDetail): RevisionScreen {
  const model = revisionPanelModel({ ok: true, status: 200, replayed: false, data: detail }, { openRevisionNo: 1, dataVersion: 6, viewerMayDraft: false });
  if (model.kind !== "ready") throw new Error("expected a ready model");
  return model.screen;
}

function renderSection(detail: ListingRevisionDetail) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <RevisionContentSection screen={screenOf(detail)} />
    </NextIntlClientProvider>,
  );
}

describe("RevisionContentSection (listing-publish E06-S2, spec section 6, RD-13, ADR-012 decision 1)", () => {
  it("revisionContentSection_markupInDescription_shownAsCharacters: markup and a link typed in the texts show as characters, never as HTML or a link", () => {
    const { container } = renderSection({
      ...PENDING,
      title: "<i>Phòng</i> www.abc.vn",
      description: "<b>Phòng</b> rộng <a href=\"https://x.vn\">x</a>",
    });

    expect(screen.getByText("<i>Phòng</i> www.abc.vn")).toBeTruthy();
    expect(screen.getByText('<b>Phòng</b> rộng <a href="https://x.vn">x</a>')).toBeTruthy();
    for (const tag of ["b", "i", "a"]) expect(container.querySelector(tag)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("revisionContentSection_lineBreaks_kept: the description keeps its line breaks; empty texts read 'Not written yet.'; features with their labels", () => {
    const view = renderSection(PENDING);

    const description = screen.getByText((_, element) => element?.textContent === "Phòng rộng.\nGần chợ." && element.tagName === "DD");
    expect(description.className).toContain("whitespace-pre-line");
    expect(screen.getByText(r.title)).toBeTruthy();
    expect(screen.getByText("Phòng trọ gần trường đại học")).toBeTruthy();
    const features = screen.getByRole("list", { name: r.features.heading });
    expect(within(features).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Furniture: Basic furniture",
      "Air conditioner",
      "Kitchen: Private",
    ]);
    view.unmount();

    renderSection({
      ...PENDING,
      status: "DRAFT",
      title: null,
      description: null,
      features: { ...PENDING.features, furnishing: null, airConditioner: false, kitchen: null },
      termsSnapshot: null,
      unitSnapshot: null,
      submittedAt: null,
    });
    expect(screen.getAllByText(r.notWritten)).toHaveLength(2);
    expect(screen.getByText(r.features.none)).toBeTruthy();
    expect(screen.getByText(r.terms.none)).toBeTruthy();
    expect(screen.queryByText(r.unit.heading)).toBeNull();
    expect(screen.queryByText(/the content is locked/)).toBeNull();
  });

  it("revisionContentSection_unitSnapshot_linesWithAssetType: the unit at submission with its type, place, rooms and area; the terms read-only; the submitted line", () => {
    renderSection(PENDING);

    const unit = screen.getByRole("list", { name: r.unit.heading });
    expect(within(unit).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Apartment",
      "Phường Bến Thành, Thành phố Hồ Chí Minh",
      "2 bedrooms, 1 bathroom",
      "25.5 m²",
    ]);
    const terms = screen.getByRole("region", { name: r.terms.heading });
    expect(within(terms).getByText(r.terms.sources.IN_EFFECT)).toBeTruthy();
    expect(within(terms).getByText("No deposit")).toBeTruthy();
    expect(within(terms).queryByRole("radio")).toBeNull();
    expect(screen.getByText(/^Submitted Nov 21, 2026/).textContent).toMatch(/10:00\sAM; the content is locked\.$/);
  });
});
