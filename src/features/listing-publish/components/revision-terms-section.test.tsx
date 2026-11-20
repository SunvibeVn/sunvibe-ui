import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { RevisionCommand, RevisionCommandOutcome, RevisionTermsScreen } from "../lib/revision-model";
import { termsLines } from "../lib/revision-model";
import type { ListingRevisionChange, ListingTerms, ListingTermsSources } from "../types";

// The edge only: the sources read and the capture, so no request leaves the test.
vi.mock("../services/revision-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/revision-api")>()),
  getListingTermsSources: vi.fn(),
  captureListingRevisionTerms: vi.fn(),
}));

import { captureListingRevisionTerms, getListingTermsSources } from "../services/revision-api";

import { RevisionTermsSection } from "./revision-terms-section";

const t = en.ListingPublish.revision.terms;
const LISTING_ID = "01JG000000000000000000000L";

const TERMS: ListingTerms = {
  monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
  deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
  minimumTermMonths: 6,
  paymentPeriodMonths: 1,
  mandatoryFees: [{ name: "Nước", basis: "AMOUNT", amount: 25000, currency: "VND", chargeUnit: "PER_M3" }],
};

const PENDING_TERMS: ListingTerms = { ...TERMS, monthlyRent: { amount: 5000000, currency: "VND", unit: "MONTH" }, mandatoryFees: [] };

const SNAPSHOT: RevisionTermsScreen = {
  sourceKey: "revision.terms.sources.PENDING_START",
  pendingStartDate: "2026-12-01",
  capturedAt: "2026-11-21T02:00:00Z",
  lines: termsLines(TERMS),
};

const sourcesAnswer = (data: ListingTermsSources): ApiResult<ListingTermsSources> => ({ ok: true, status: 200, replayed: false, data });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function wrap(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      {node}
    </NextIntlClientProvider>
  );
}

/** The panel's runner, as the panel's hook gives it: it sends and hands the outcome on. */
function runner() {
  const outcomes: RevisionCommandOutcome[] = [];
  const run = vi.fn(async (_command: RevisionCommand, send: () => Promise<RevisionCommandOutcome>) => {
    outcomes.push(await send());
  });
  return { run, outcomes };
}

function editable(busy: RevisionCommand | null, run: ReturnType<typeof runner>["run"], reread = vi.fn<() => void>(), snapshot: RevisionTermsScreen | null = null) {
  return (
    <RevisionTermsSection
      editable
      snapshot={snapshot}
      listingId={LISTING_ID}
      revisionNo={1}
      dataVersion={4}
      busy={busy}
      run={run}
      reread={reread}
    />
  );
}

describe("RevisionTermsSection (listing-publish E06-S2, spec section 6, US-2 AC-2)", () => {
  beforeEach(() => {
    vi.mocked(getListingTermsSources).mockReset();
    vi.mocked(captureListingRevisionTerms).mockReset();
  });

  it("revisionTermsSection_snapshot_readOnlyLines: the snapshot's source, start date, capture time and lines, read-only; without one 'No terms snapshot yet.'", () => {
    const view = render(wrap(<RevisionTermsSection editable={false} snapshot={SNAPSHOT} />));

    const region = screen.getByRole("region", { name: t.heading });
    expect(within(region).getByText("Terms of the version starting Dec 1, 2026")).toBeTruthy();
    expect(within(region).getByText(/^taken Nov 21, 2026/).textContent).toMatch(/9:00/);
    expect(within(region).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Rent: 4,500,000 VND / month",
      "Deposit: 2 months' rent",
      "Minimum term: 6 months",
      "Pay every month",
      "Nước: 25,000 VND per m³",
    ]);
    expect(within(region).queryByRole("radio")).toBeNull();
    expect(within(region).queryByRole("button")).toBeNull();
    expect(getListingTermsSources).not.toHaveBeenCalled();
    view.unmount();

    render(wrap(<RevisionTermsSection editable={false} snapshot={null} />));
    expect(screen.getByText(t.none)).toBeTruthy();
  });

  it("revisionTermsSection_feeNameMarkup_plainText: a fee name holding markup and a link shows those characters, never an element or a link", () => {
    const snapshot: RevisionTermsScreen = {
      ...SNAPSHOT,
      lines: termsLines({
        ...TERMS,
        mandatoryFees: [{ name: "<b>Phí</b> https://x.vn", basis: "INCLUDED", amount: null, currency: null, chargeUnit: null }],
      }),
    };
    const { container } = render(wrap(<RevisionTermsSection editable={false} snapshot={snapshot} />));

    expect(screen.getByText("<b>Phí</b> https://x.vn: included in the rent")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("revisionTermsSection_sources_bothChoicesThenTake: the two sources as choices with their terms; the chosen one is taken once, 'Taking…' while it runs", async () => {
    vi.mocked(getListingTermsSources).mockResolvedValueOnce(
      sourcesAnswer({ ended: false, inEffect: TERMS, pending: { startDate: "2026-12-01", terms: PENDING_TERMS } }),
    );
    const capture = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(captureListingRevisionTerms).mockReturnValueOnce(capture.promise);
    const { run, outcomes } = runner();
    const reread = vi.fn<() => void>();
    const view = render(wrap(editable(null, run, reread)));

    expect(screen.getByText(t.none)).toBeTruthy();
    expect(screen.getByText(t.sourcesLoading)).toBeTruthy();
    const inEffect = (await screen.findByRole("radio", { name: t.sources.IN_EFFECT })) as HTMLInputElement;
    const pending = screen.getByRole("radio", { name: "Terms of the version starting Dec 1, 2026" }) as HTMLInputElement;
    expect(inEffect.checked).toBe(true);
    expect(pending.checked).toBe(false);
    expect(screen.getByText("Rent: 4,500,000 VND / month")).toBeTruthy();
    expect(screen.getByText("Rent: 5,000,000 VND / month")).toBeTruthy();
    expect(getListingTermsSources).toHaveBeenCalledWith(LISTING_ID);

    fireEvent.click(pending);
    expect(pending.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t.take }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe("capture");
    expect(captureListingRevisionTerms).toHaveBeenCalledTimes(1);
    expect(captureListingRevisionTerms).toHaveBeenCalledWith(LISTING_ID, 1, 4, "PENDING_START");

    // The panel marks the capture as running: the button reads "Taking…", disabled, with the choices.
    view.rerender(wrap(editable("capture", run, reread)));
    const taking = screen.getByRole("button", { name: t.taking }) as HTMLButtonElement;
    expect(taking.disabled).toBe(true);
    expect((screen.getByRole("radio", { name: t.sources.IN_EFFECT }) as HTMLInputElement).disabled).toBe(true);

    capture.resolve({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 5 } });
    await waitFor(() => expect(outcomes).toEqual([{ kind: "done" }]));
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it("revisionTermsSection_noSource_sentence: an ended agreement or no source reads 'No terms can be taken now.' with nothing to take; a failed read offers Try again", async () => {
    vi.mocked(getListingTermsSources)
      .mockResolvedValueOnce(sourcesAnswer({ ended: true, inEffect: null, pending: null }))
      .mockResolvedValueOnce(sourcesAnswer({ ended: false, inEffect: null, pending: null }))
      .mockResolvedValueOnce({ ok: false, kind: "network" })
      .mockResolvedValueOnce(sourcesAnswer({ ended: false, inEffect: TERMS, pending: null }));
    const { run } = runner();

    let view = render(wrap(editable(null, run)));
    expect(await screen.findByText(t.noSource)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.take })).toBeNull();
    view.unmount();

    view = render(wrap(editable(null, run)));
    expect(await screen.findByText(t.noSource)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    view.unmount();

    render(wrap(editable(null, run)));
    expect(await screen.findByText(t.sourcesFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.ListingPublish.revision.retry }));
    expect(await screen.findByRole("radio", { name: t.sources.IN_EFFECT })).toBeTruthy();
    expect(getListingTermsSources).toHaveBeenCalledTimes(4);
    expect(run).not.toHaveBeenCalled();
  });
});
