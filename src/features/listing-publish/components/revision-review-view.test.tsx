import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingRevisionDetail, ListingRevisionReview, ListingTerms } from "../types";

// The edges only: the review calls and the revision read, so no request leaves the test.
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  getListingRevisionReview: vi.fn(),
  decideListingRevision: vi.fn(),
  openListingUnitLocation: vi.fn(),
}));
vi.mock("../services/revision-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/revision-api")>()),
  getListingRevision: vi.fn(),
}));

import { decideListingRevision, getListingRevisionReview, openListingUnitLocation } from "../services/review-api";
import { getListingRevision } from "../services/revision-api";

import { RevisionReviewView } from "./revision-review-view";

const v = en.ListingPublish.review;
const LISTING_ID = "01JG000000000000000000000L";

const TERMS: ListingTerms = {
  monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
  deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
  minimumTermMonths: 6,
  paymentPeriodMonths: 1,
  mandatoryFees: [],
};

const REVIEW: ListingRevisionReview = {
  listingId: LISTING_ID,
  code: "TD-7K3M-Q9TX",
  revisionNo: 2,
  status: "PENDING_REVIEW",
  dataVersion: 9,
  viewerMayReview: true,
  notEligibleReasons: [],
  advertising: {
    allowed: true,
    ended: false,
    reasonGroups: [],
    endDate: "2027-05-31",
    interiorPhotos: true,
    exteriorPhotos: false,
    termsInEffect: TERMS,
    pending: null,
  },
  termsMatch: "IN_EFFECT",
  unit: { unitCode: "A-101", availability: "AVAILABLE", availabilityDiffers: true },
  freshness: { confirmedOn: "2026-11-20", validThrough: "2026-12-04", deadlinePassed: false, latestValid: true },
  checklist: ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT"],
};

const REVISION: ListingRevisionDetail = {
  listingId: LISTING_ID,
  revisionNo: 2,
  status: "PENDING_REVIEW",
  createdAt: "2026-11-20T03:15:00Z",
  updatedAt: "2026-11-21T03:15:00Z",
  title: "Phòng trọ gần trường đại học",
  description: "Phòng rộng.\nGần chợ.",
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
  termsSnapshot: { source: "IN_EFFECT", pendingStartDate: null, capturedAt: "2026-11-21T02:00:00Z", terms: TERMS },
  unitSnapshot: {
    assetType: "HOUSE",
    provinceCode: "79",
    provinceName: "Thành phố Hồ Chí Minh",
    wardCode: "26734",
    wardName: "Phường Bến Thành",
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 25.5,
  },
  submittedAt: "2026-11-21T03:00:00Z",
  dataVersion: 9,
  problems: [],
};

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<never> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderView(revisionNo = "2") {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <RevisionReviewView listingId={LISTING_ID} revisionNo={revisionNo} />
    </NextIntlClientProvider>,
  );
}

const region = (name: string) => screen.getByRole("region", { name });

describe("RevisionReviewView (listing-publish US-4 AC-2, spec section 6, E06S4-D11, D17)", () => {
  beforeEach(() => {
    for (const call of [getListingRevisionReview, getListingRevision, decideListingRevision, openListingUnitLocation]) vi.mocked(call).mockReset();
  });

  it("revisionReviewView_ready_sectionsHeaderCodeNoLocation: the header with the review read's code, the content, Agreement, Terms check, Unit, Freshness and Checklist; no real location until asked", async () => {
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(ok(REVIEW));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION));
    const view = renderView();

    expect(await screen.findByRole("heading", { level: 1, name: "Review of listing TD-7K3M-Q9TX" })).toBeTruthy();
    expect(getListingRevisionReview).toHaveBeenCalledWith(LISTING_ID, 2);
    expect(getListingRevision).toHaveBeenCalledWith(LISTING_ID, 2);
    expect(screen.getByText("Revision 2: Pending review")).toBeTruthy();
    expect(screen.getByRole("link", { name: v.backToQueue }).getAttribute("href")).toBe("/workspace/listings/reviews");
    expect(screen.queryByText(v.notEligible)).toBeNull();

    expect(within(region(v.content)).getByText("Phòng trọ gần trường đại học")).toBeTruthy();
    expect(within(region(v.content)).getByText("Rent: 4,500,000 VND / month", { selector: "li" })).toBeTruthy();
    const agreement = region(v.agreement.heading);
    for (const text of [v.agreement.allowed, "Ends on May 31, 2027", "Interior photos: Yes", "Exterior photos: No"]) {
      expect(within(agreement).getByText(text)).toBeTruthy();
    }
    expect(within(region(v.termsCheck)).getByText(v.termsMatch.IN_EFFECT)).toBeTruthy();
    const unit = region(v.unit.heading);
    for (const text of ["A-101", "Phường Bến Thành", v.availabilities.AVAILABLE, v.unit.availabilityDiffers]) {
      expect(within(unit).getByText(text)).toBeTruthy();
    }
    expect(within(unit).getByRole("button", { name: v.location.show })).toBeTruthy();
    expect(within(unit).queryByText(v.location.label)).toBeNull();
    expect(openListingUnitLocation).not.toHaveBeenCalled();
    const freshness = region(v.freshness.heading);
    expect(within(freshness).getByText("Latest valid confirmation: Nov 20, 2026")).toBeTruthy();
    expect(within(freshness).getByText("Valid through: Dec 4, 2026")).toBeTruthy();
    expect(within(region(v.checklist)).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      v.checks.CONTENT_MATCHES_UNIT,
      v.checks.TEXT_FOLLOWS_RULES,
      v.checks.TERMS_MATCH_AGREEMENT,
      v.checks.NO_FRAUD_SIGNS,
      v.checks.AGREEMENT_END_AND_RIGHT,
    ]);
    view.unmount();

    // A reader who may not decide: the eligibility line with the reasons, no location button.
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(
      ok({ ...REVIEW, viewerMayReview: false, notEligibleReasons: ["AUTHOR", "ASSIGNED_SALE"], freshness: { ...REVIEW.freshness, deadlinePassed: true, latestValid: false } }),
    );
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION));
    renderView();
    expect(await screen.findByText(v.notEligible)).toBeTruthy();
    expect(screen.getByText(v.ineligible.AUTHOR)).toBeTruthy();
    expect(screen.getByText(v.ineligible.ASSIGNED_SALE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: v.location.show })).toBeNull();
    expect(within(region(v.freshness.heading)).getByText(v.freshness.expired)).toBeTruthy();
    expect(within(region(v.freshness.heading)).getByText(v.freshness.notValid)).toBeTruthy();
  });

  it("revisionReviewView_states_loading403404ErrorRetry: 'Loading the review…' until both reads answered; the 403 and 404 sentences; an error with Try again reading both again; a revision number not in canonical form is the 404 with no request", async () => {
    const review = deferred<ApiResult<ListingRevisionReview>>();
    const revision = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevisionReview).mockReturnValueOnce(review.promise);
    vi.mocked(getListingRevision).mockReturnValueOnce(revision.promise);
    let view = renderView();

    expect(screen.getByRole("status").textContent).toBe(v.loading);
    review.resolve(ok(REVIEW));
    await waitFor(() => expect(getListingRevisionReview).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status").textContent).toBe(v.loading);
    revision.resolve(http(500, "INTERNAL_ERROR"));
    expect(await screen.findByText(v.loadFailed)).toBeTruthy();
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(ok(REVIEW));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION));
    fireEvent.click(screen.getByRole("button", { name: v.retry }));
    expect(await screen.findByRole("heading", { level: 1, name: "Review of listing TD-7K3M-Q9TX" })).toBeTruthy();
    expect(getListingRevisionReview).toHaveBeenCalledTimes(2);
    expect(getListingRevision).toHaveBeenCalledTimes(2);
    view.unmount();

    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(http(403, "FORBIDDEN"));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION));
    view = renderView();
    expect(await screen.findByText(v.forbidden)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    view.unmount();

    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(http(404, "NOT_FOUND"));
    vi.mocked(getListingRevision).mockResolvedValueOnce(http(404, "NOT_FOUND"));
    view = renderView();
    expect(await screen.findByText(v.notFound)).toBeTruthy();
    expect(screen.getByRole("link", { name: v.backToQueue }).getAttribute("href")).toBe("/workspace/listings/reviews");
    view.unmount();

    vi.mocked(getListingRevisionReview).mockClear();
    vi.mocked(getListingRevision).mockClear();
    renderView("01");
    expect(screen.getByText(v.notFound)).toBeTruthy();
    expect(screen.getByRole("link", { name: v.backToQueue })).toBeTruthy();
    expect(getListingRevisionReview).not.toHaveBeenCalled();
    expect(getListingRevision).not.toHaveBeenCalled();
  });

  it("revisionReviewView_oneReadFailed_errorNotHalfPage: one read answered and the other failed is the error with Try again, never half a page", async () => {
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(ok(REVIEW));
    vi.mocked(getListingRevision).mockResolvedValueOnce({ ok: false, kind: "network" });
    const view = renderView();

    expect(await screen.findByText(v.loadFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: v.retry })).toBeTruthy();
    expect(screen.queryByText(/TD-7K3M-Q9TX/)).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
    view.unmount();

    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(http(500, "INTERNAL_ERROR"));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION));
    renderView();
    expect(await screen.findByText(v.loadFailed)).toBeTruthy();
    expect(screen.queryByText("Phòng trọ gần trường đại học")).toBeNull();
  });

  it("revisionReviewView_content_textOnly: the title and description are shown as text, with no element or link of their own", async () => {
    const title = '<b>Rẻ</b> <a href="https://example.com">xem</a>';
    const description = "<img src=x onerror=alert(1)> https://example.com\n<i>đẹp</i>";
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(ok(REVIEW));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok({ ...REVISION, title, description }));
    renderView();

    const content = await screen.findByRole("region", { name: v.content });
    expect(within(content).getByText(title)).toBeTruthy();
    expect(within(content).getByText((_, element) => element?.textContent === description && element.tagName === "DD")).toBeTruthy();
    expect(content.querySelector("b, i, img, a")).toBeNull();
  });

  // The decision and the re-read in place after its answer (spec section 6, E06S4-D17; Task B5 mounts the form).

  const d = v.decision;
  const change = (status: "NEEDS_CHANGES" | "APPROVED", dataVersion: number) =>
    ok({ listingId: LISTING_ID, revisionNo: 2, status, dataVersion }) as Awaited<ReturnType<typeof decideListingRevision>>;
  const refusal = (status: number, code: string, fields: string[] = []) =>
    ({ ok: false, kind: "http", status, code, fieldErrors: fields.map((field) => ({ field, message: "Fixed server message." })) }) as Awaited<
      ReturnType<typeof decideListingRevision>
    >;
  const decided = (status: ListingRevisionReview["status"], reasons: ListingRevisionReview["notEligibleReasons"]) =>
    ok({ ...REVIEW, status, dataVersion: 10, viewerMayReview: false, notEligibleReasons: reasons });
  const formShown = () => screen.queryByRole("group", { name: d.outcome }) !== null;
  const submit = () => screen.getByRole("button", { name: d.submit }) as HTMLButtonElement;
  const noteValue = () => (screen.queryByRole("textbox", { name: d.note }) as HTMLTextAreaElement | null)?.value;

  /** The page ready for a reviewer who may decide, with a return chosen, one reason ticked and a note typed. */
  async function readyWithReturn() {
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(ok(REVIEW));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION));
    const view = renderView();
    fireEvent.click(await screen.findByRole("radio", { name: v.outcomes.NEEDS_CHANGES }));
    fireEvent.click(screen.getByRole("checkbox", { name: v.changeReasons.MISSING_INFORMATION }));
    fireEvent.change(screen.getByRole("textbox", { name: d.note }), { target: { value: "Thiếu diện tích." } });
    return view;
  }

  it("revisionReviewView_concurrent_rereadKeepsValuesSendsNewVersion: after 409 CONCURRENT_MODIFICATION both reads run again in place, the form keeps everything chosen and typed, says the listing changed, and sends the re-read's data version", async () => {
    await readyWithReturn();
    const review = deferred<ApiResult<ListingRevisionReview>>();
    const revision = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevisionReview).mockReturnValueOnce(review.promise);
    vi.mocked(getListingRevision).mockReturnValueOnce(revision.promise);
    vi.mocked(decideListingRevision).mockResolvedValueOnce(refusal(409, "CONCURRENT_MODIFICATION")).mockResolvedValueOnce(change("NEEDS_CHANGES", 11));

    fireEvent.click(submit());
    await waitFor(() => expect(getListingRevisionReview).toHaveBeenCalledTimes(2));
    expect(getListingRevision).toHaveBeenCalledTimes(2);
    expect(vi.mocked(decideListingRevision).mock.calls[0]?.[2]).toMatchObject({ dataVersion: 9 });
    // No loading state: the page stays with its form while the reads run; the form waits for them.
    expect(screen.queryByText(v.loading)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Review of listing TD-7K3M-Q9TX" })).toBeTruthy();
    expect(submit().disabled).toBe(true);

    review.resolve(ok({ ...REVIEW, dataVersion: 10 }));
    revision.resolve(ok({ ...REVISION, dataVersion: 10 }));
    await waitFor(() => expect(submit().disabled).toBe(false));
    expect((screen.getByRole("alert") as HTMLElement).textContent).toBe(d.answers.concurrent);
    expect((screen.getByRole("radio", { name: v.outcomes.NEEDS_CHANGES }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: v.changeReasons.MISSING_INFORMATION }) as HTMLInputElement).checked).toBe(true);
    expect(noteValue()).toBe("Thiếu diện tích.");

    vi.mocked(getListingRevisionReview).mockReturnValue(new Promise(() => undefined));
    vi.mocked(getListingRevision).mockReturnValue(new Promise(() => undefined));
    fireEvent.click(submit());
    await waitFor(() => expect(decideListingRevision).toHaveBeenCalledTimes(2));
    expect(vi.mocked(decideListingRevision).mock.calls[1]?.[2]).toEqual({
      dataVersion: 10,
      outcome: "NEEDS_CHANGES",
      changeReasons: ["MISSING_INFORMATION"],
      note: "Thiếu diện tích.",
    });
  });

  it("revisionReviewView_notPendingOrArchived_formGoneSentenceReasons: after 409 REVISION_NOT_PENDING, 409 LISTING_ARCHIVED or 403 REVIEWER_NOT_INDEPENDENT both reads run again, the form is gone, the answer's sentence stays and the eligibility line shows the re-read's reasons", async () => {
    const rows: [ReturnType<typeof refusal>, string, ListingRevisionReview["notEligibleReasons"], string][] = [
      [refusal(409, "REVISION_NOT_PENDING"), d.answers.notPending, ["NOT_PENDING"], v.ineligible.NOT_PENDING],
      [refusal(409, "LISTING_ARCHIVED"), d.answers.archived, ["LISTING_ARCHIVED"], v.ineligible.LISTING_ARCHIVED],
      [refusal(403, "REVIEWER_NOT_INDEPENDENT", ["reasons.ASSIGNED_SALE"]), d.answers.notIndependent, ["ASSIGNED_SALE"], v.ineligible.ASSIGNED_SALE],
    ];
    for (const [answer, sentence, reasons, reasonText] of rows) {
      const view = await readyWithReturn();
      vi.mocked(decideListingRevision).mockResolvedValueOnce(answer);
      vi.mocked(getListingRevisionReview).mockResolvedValueOnce(decided("PENDING_REVIEW", reasons));
      vi.mocked(getListingRevision).mockResolvedValueOnce(ok({ ...REVISION, dataVersion: 10 }));
      fireEvent.click(submit());

      await waitFor(() => expect(formShown()).toBe(false));
      expect(screen.getByRole("alert").querySelector("p")?.textContent).toBe(sentence);
      expect(screen.getByText(v.notEligible)).toBeTruthy();
      expect(within(screen.getByText(v.notEligible).closest("[role=status]") as HTMLElement).getByText(reasonText)).toBeTruthy();
      expect(screen.queryByRole("button", { name: v.location.show })).toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: "Review of listing TD-7K3M-Q9TX" })).toBeTruthy();
      view.unmount();
      vi.mocked(getListingRevisionReview).mockReset();
      vi.mocked(getListingRevision).mockReset();
    }
  });

  it("revisionReviewView_termsMismatch_keepsFormApproveDisabled: after 409 REVISION_TERMS_MISMATCH the re-read's terms check shows, the form keeps its five ticks and Approve waits on the terms", async () => {
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(ok(REVIEW)).mockResolvedValueOnce(ok({ ...REVIEW, dataVersion: 10, termsMatch: "NONE" }));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION)).mockResolvedValueOnce(ok({ ...REVISION, dataVersion: 10 }));
    vi.mocked(decideListingRevision).mockResolvedValueOnce(refusal(409, "REVISION_TERMS_MISMATCH"));
    renderView();
    fireEvent.click(await screen.findByRole("radio", { name: v.outcomes.APPROVED }));
    for (const code of REVIEW.checklist) fireEvent.click(screen.getByRole("checkbox", { name: v.checks[code] }));
    fireEvent.click(submit());

    await waitFor(() => expect(within(region(v.termsCheck)).queryByText(v.termsMatch.NONE)).not.toBeNull());
    expect(screen.getByRole("alert").textContent).toBe(d.answers.termsMismatch);
    expect(formShown()).toBe(true);
    for (const code of REVIEW.checklist) {
      expect((screen.getByRole("checkbox", { name: v.checks[code] }) as HTMLInputElement).checked).toBe(true);
    }
    expect(submit().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: v.outcomes.NEEDS_CHANGES }));
    expect(submit().disabled).toBe(false);
  });

  it("revisionReviewView_decided_rereadShowsRecorded: after a 200 both reads run again in place; 'Decision recorded.', the new status and no form", async () => {
    await readyWithReturn();
    vi.mocked(decideListingRevision).mockResolvedValueOnce(change("NEEDS_CHANGES", 10));
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(decided("NEEDS_CHANGES", ["NOT_PENDING"]));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok({ ...REVISION, status: "NEEDS_CHANGES", dataVersion: 10 }));
    fireEvent.click(submit());

    expect(await screen.findByText(v.recorded)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Revision 2: Needs changes")).not.toBeNull());
    expect(formShown()).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getListingRevisionReview).toHaveBeenCalledTimes(2);
    expect(getListingRevision).toHaveBeenCalledTimes(2);
  });

  it("revisionReviewView_rereadFails_keepsShownWithoutFormRetry: a re-read that fails keeps what is shown without the form, with Try again, which reads both again in place", async () => {
    await readyWithReturn();
    vi.mocked(decideListingRevision).mockResolvedValueOnce(refusal(409, "CONCURRENT_MODIFICATION"));
    vi.mocked(getListingRevisionReview).mockResolvedValueOnce(http(500, "INTERNAL_ERROR")).mockResolvedValueOnce(ok({ ...REVIEW, dataVersion: 10 }));
    vi.mocked(getListingRevision).mockResolvedValueOnce(ok(REVISION)).mockResolvedValueOnce(ok({ ...REVISION, dataVersion: 10 }));
    fireEvent.click(submit());

    expect(await screen.findByText(v.rereadFailed)).toBeTruthy();
    expect(formShown()).toBe(false);
    expect(screen.getByRole("heading", { level: 1, name: "Review of listing TD-7K3M-Q9TX" })).toBeTruthy();
    expect(within(region(v.content)).getByText("Phòng trọ gần trường đại học")).toBeTruthy();
    expect(screen.queryByText(v.loading)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: v.retry }));
    await waitFor(() => expect(formShown()).toBe(true));
    expect(getListingRevisionReview).toHaveBeenCalledTimes(3);
    expect(getListingRevision).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(v.rereadFailed)).toBeNull();
    expect(screen.queryByText(v.loading)).toBeNull();
  });
});
