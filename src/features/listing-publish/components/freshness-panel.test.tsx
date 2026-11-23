import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingFreshness, ListingFreshnessRecord, ListingFreshnessRecorded } from "../types";

// The edge only: the freshness calls, so no request leaves the test.
vi.mock("../services/freshness-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/freshness-api")>()),
  getListingFreshness: vi.fn(),
  recordListingFreshness: vi.fn(),
}));

import { getListingFreshness, recordListingFreshness } from "../services/freshness-api";

import { FreshnessPanel } from "./freshness-panel";

const f = en.ListingPublish.freshness;
const LISTING_ID = "01JG000000000000000000000L";
const AGREEMENT_HREF = "/workspace/brokerage-agreements/01JF000000000000000000000A";

const NO_RECORD: ListingFreshness = {
  listingId: LISTING_ID,
  confirmedOn: null,
  reconfirmFrom: null,
  validThrough: null,
  reconfirmationDue: false,
  deadlinePassed: false,
  latest: null,
};

const VALID_RECORD: ListingFreshnessRecord = {
  contactDate: "2027-03-01",
  recordedAt: "2027-03-01T02:10:00Z",
  channel: "CALL",
  outcome: "AVAILABLE",
  termsStillApply: true,
  unitUnchanged: true,
  valid: true,
  note: null,
};

/** A valid confirmation on 2027-03-01 read after its deadline: both flags on. */
const READY: ListingFreshness = {
  listingId: LISTING_ID,
  confirmedOn: "2027-03-01",
  reconfirmFrom: "2027-03-11",
  validThrough: "2027-03-15",
  reconfirmationDue: true,
  deadlinePassed: true,
  latest: VALID_RECORD,
};

const answered = (data: ListingFreshness): ApiResult<ListingFreshness> => ({ ok: true, status: 200, replayed: false, data });
const failed = (status: number, code: string): ApiResult<ListingFreshness> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });
const RECORDED: ApiResult<ListingFreshnessRecorded> = {
  ok: true,
  status: 201,
  replayed: false,
  data: { listingId: LISTING_ID, dataVersion: 5, valid: true },
};

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/** Lets every answer already given reach the screen. */
const settle = () => act(async () => new Promise<void>((done) => setTimeout(done, 0)));

function renderPanel({ viewerMayRecord = true } = {}) {
  const onListingChanged = vi.fn<(change: "recorded" | "concurrent" | "gone") => void>();
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <FreshnessPanel
        listingId={LISTING_ID}
        dataVersion={4}
        viewerMayRecord={viewerMayRecord}
        agreementHref={AGREEMENT_HREF}
        listingRereading={false}
        onListingChanged={onListingChanged}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onListingChanged };
}

const region = () => screen.getByRole("region", { name: f.heading });
const recordButton = () => within(region()).queryByRole("button", { name: f.record });
const choose = (name: string) => fireEvent.click(within(region()).getByRole("radio", { name }));

describe("FreshnessPanel (listing-publish US-6 AC-1, AC-2, AC-6, spec section 6, E06S3-D11, D12)", () => {
  beforeEach(() => {
    vi.mocked(getListingFreshness).mockReset();
    vi.mocked(recordListingFreshness).mockReset();
  });

  it("freshnessPanel_states_loadingErrorEmptyReady: loading, an error with Try again reading again, no record, and the ready lines", async () => {
    const first = deferred<ApiResult<ListingFreshness>>();
    vi.mocked(getListingFreshness).mockReturnValueOnce(first.promise).mockResolvedValueOnce(answered(NO_RECORD));
    const view = renderPanel();

    expect(within(region()).queryByRole("status")?.textContent).toBe(f.loading);
    first.resolve(failed(500, "INTERNAL_ERROR"));
    await waitFor(() =>
      expect([within(region()).queryByText(f.loadFailed) !== null, within(region()).queryByRole("button", { name: f.retry }) !== null]).toEqual([
        true,
        true,
      ]),
    );
    fireEvent.click(within(region()).getByRole("button", { name: f.retry }));
    await waitFor(() => expect(getListingFreshness).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(region()).queryByText(f.none)).not.toBeNull());
    view.unmount();

    vi.mocked(getListingFreshness).mockResolvedValueOnce(answered(READY));
    renderPanel();
    const lines = [
      "Last valid confirmation: Mar 1, 2027",
      "Reconfirm from: Mar 11, 2027",
      f.due,
      "Valid through: Mar 15, 2027",
      f.expired,
      "Latest contact: Mar 1, 2027, Phone call: Still available",
      "Terms still apply: Yes",
      "Unit unchanged: Yes",
    ];
    await waitFor(() => expect(lines.filter((line) => within(region()).queryByText(line) === null)).toEqual([]));
  });

  it("freshnessPanel_notFound_asksListingReread: a 404 read asks the page to read the listing again, as a plain re-read", async () => {
    vi.mocked(getListingFreshness).mockResolvedValueOnce(failed(404, "NOT_FOUND"));
    const { onListingChanged } = renderPanel();

    await waitFor(() => expect(onListingChanged.mock.calls).toEqual([["gone"]]));
  });

  it("freshnessPanel_latestNotAvailable_promptWithAgreementLink: a latest 'No longer available' shows the prompt with the agreement's link (FR-6)", async () => {
    vi.mocked(getListingFreshness).mockResolvedValueOnce(
      answered({
        ...NO_RECORD,
        latest: { ...VALID_RECORD, outcome: "NOT_AVAILABLE", termsStillApply: null, unitUnchanged: null, valid: false },
      }),
    );
    renderPanel();

    await waitFor(() => expect(within(region()).queryByText(f.prompt, { exact: false })).not.toBeNull());
    expect(within(region()).queryByRole("link", { name: f.goToAgreement })?.getAttribute("href")).toBe(AGREEMENT_HREF);
  });

  it("freshnessPanel_formOnlyForRecorder: 'Record a contact' only for the assigned Sale of a listing not archived", async () => {
    vi.mocked(getListingFreshness).mockResolvedValueOnce(answered(NO_RECORD));
    const view = renderPanel({ viewerMayRecord: true });
    await waitFor(() => expect(recordButton()).not.toBeNull());
    view.unmount();

    vi.mocked(getListingFreshness).mockResolvedValueOnce(answered(NO_RECORD));
    renderPanel({ viewerMayRecord: false });
    await within(region()).findByText(f.none);
    expect(recordButton()).toBeNull();
  });

  it("freshnessPanel_note_textOnlyLineBreaksKept: the private note is text only, never HTML or a link, its line breaks kept", async () => {
    const note = "<b>x</b>\nhttps://a.b";
    vi.mocked(getListingFreshness).mockResolvedValueOnce(answered({ ...READY, latest: { ...VALID_RECORD, note } }));
    renderPanel();
    await settle();

    expect(region().querySelector("b")).toBeNull();
    expect(within(region()).queryByRole("link")).toBeNull();
    const shown = within(region()).queryByText("<b>x</b> https://a.b");
    expect([shown?.textContent, shown?.className.includes("whitespace-pre-line")]).toEqual([note, true]);
  });

  it("freshnessPanel_afterRecord_readsAgain: a record that answers 201 closes the form and reads the freshness again", async () => {
    vi.mocked(getListingFreshness).mockResolvedValueOnce(answered(NO_RECORD)).mockReturnValueOnce(new Promise(() => undefined));
    vi.mocked(recordListingFreshness).mockResolvedValueOnce(RECORDED);
    renderPanel();

    await waitFor(() => expect(recordButton()).not.toBeNull());
    fireEvent.click(recordButton() as HTMLElement);
    choose(f.channels.CALL);
    choose(f.outcomes.AVAILABLE);
    fireEvent.click(within(within(region()).getByRole("group", { name: f.form.termsQuestion })).getByRole("radio", { name: f.form.termsYes }));
    fireEvent.click(within(region()).getByRole("radio", { name: f.form.unitUnchangedYes }));
    fireEvent.click(within(region()).getByRole("button", { name: f.form.save }));
    await waitFor(() => expect(getListingFreshness).toHaveBeenCalledTimes(2));
    expect(within(region()).queryByRole("button", { name: f.form.save })).toBeNull();
  });

  it("freshnessPanel_texts_noRevisionPanelTexts: the panel holds none of the revision panel's or the page's texts", async () => {
    vi.mocked(getListingFreshness).mockResolvedValueOnce(
      answered({ ...READY, latest: { ...VALID_RECORD, outcome: "NOT_AVAILABLE", termsStillApply: null, unitUnchanged: null, valid: false, note: "Gọi lại sau." } }),
    );
    renderPanel();
    await settle();

    const text = region().textContent ?? "";
    expect(["Unpublished", "Draft", "Open the agreement", en.ListingPublish.page.notPublic].filter((outer) => text.includes(outer))).toEqual([]);
  });

  it("freshnessRecordForm_cancel_closesSendsNothing: 'Cancel' closes the form and sends nothing; 'Record a contact' shows again", async () => {
    vi.mocked(getListingFreshness).mockResolvedValueOnce(answered(NO_RECORD));
    renderPanel();

    await waitFor(() => expect(recordButton()).not.toBeNull());
    fireEvent.click(recordButton() as HTMLElement);
    choose(f.channels.CALL);
    choose(f.outcomes.AVAILABLE);
    fireEvent.click(within(region()).getByRole("button", { name: f.form.cancel }));
    expect(within(region()).queryByRole("button", { name: f.form.save })).toBeNull();
    expect(recordButton()).not.toBeNull();
    await settle();
    expect(recordListingFreshness).not.toHaveBeenCalled();
  });
});
