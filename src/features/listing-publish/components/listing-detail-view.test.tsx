import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingDetail, ListingFreshness, ListingFreshnessRecorded, ListingRevisionDetail } from "../types";

// The edge only: the listing read, the revision read, the start and the save, the terms sources, the freshness read
// and the record, so no request leaves the test. The reads a case does not answer never settle.
vi.mock("../services/listing-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/listing-api")>()),
  getListing: vi.fn(),
}));
vi.mock("../services/revision-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/revision-api")>()),
  getListingRevision: vi.fn(() => new Promise<never>(() => undefined)),
  startListingRevision: vi.fn(),
  saveListingRevisionContent: vi.fn(),
  getListingTermsSources: vi.fn(() => new Promise<never>(() => undefined)),
}));
vi.mock("../services/freshness-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/freshness-api")>()),
  getListingFreshness: vi.fn(() => new Promise<never>(() => undefined)),
  recordListingFreshness: vi.fn(),
}));
// The decision read of the "Latest review" section (E06-S4), which only a decided revision mounts.
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  getListingRevisionDecision: vi.fn(() => new Promise<never>(() => undefined)),
}));
// The publication read of the "Publication" section (E06-S6), which never settles here: the section stays loading.
vi.mock("../services/publication-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/publication-api")>()),
  getListingPublication: vi.fn(() => new Promise<never>(() => undefined)),
}));

import { getListingFreshness, recordListingFreshness } from "../services/freshness-api";
import { getListingPublication } from "../services/publication-api";
import { getListingRevisionDecision } from "../services/review-api";
import { getListing } from "../services/listing-api";
import { getListingRevision, saveListingRevisionContent, startListingRevision } from "../services/revision-api";

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
  openRevisionNo: 1,
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

  it("listingDetailView_ready_currentRevisionAboveRevisions: the 'Current revision' region precedes the 'Revisions' region", async () => {
    vi.mocked(getListing).mockResolvedValueOnce(answered(DETAIL));
    renderView();

    const current = await screen.findByRole("region", { name: en.ListingPublish.revision.heading });
    const revisions = screen.getByRole("region", { name: p.revisions });
    expect(current.compareDocumentPosition(revisions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(current).getByText(en.ListingPublish.revision.loading)).toBeTruthy();
  });

  it("listingDetailView_afterStart_startWaitsForListingReread: after a command the panel's commands wait for the listing's re-read, which brings the new open revision", async () => {
    const r = en.ListingPublish.revision;
    const reread = deferred<ApiResult<ListingDetail>>();
    vi.mocked(getListing)
      .mockResolvedValueOnce(answered({ ...DETAIL, openRevisionNo: null, revisions: [{ revisionNo: 1, status: "CANCELLED", createdAt: "2026-11-20T03:15:00Z" }] }))
      .mockReturnValueOnce(reread.promise);
    vi.mocked(startListingRevision).mockResolvedValueOnce({
      ok: true,
      status: 201,
      replayed: false,
      data: { listingId: LISTING_ID, revisionNo: 2, status: "DRAFT", dataVersion: 1 },
    });
    renderView();

    const current = await screen.findByRole("region", { name: r.heading });
    fireEvent.click(within(current).getByRole("button", { name: r.start }));
    await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
    expect(startListingRevision).toHaveBeenCalledWith(LISTING_ID, 0);

    // The start answered, the listing's re-read has not: "No draft is open." still shows, and the start waits.
    expect(within(current).getByText(r.none)).toBeTruthy();
    const starting = within(current).getByRole("button", { name: r.starting }) as HTMLButtonElement;
    expect(starting.disabled).toBe(true);
    fireEvent.click(starting);
    expect(startListingRevision).toHaveBeenCalledTimes(1);

    reread.resolve(
      answered({
        ...DETAIL,
        dataVersion: 1,
        openRevisionNo: 2,
        revisions: [
          { revisionNo: 2, status: "DRAFT", createdAt: "2026-11-21T03:15:00Z" },
          { revisionNo: 1, status: "CANCELLED", createdAt: "2026-11-20T03:15:00Z" },
        ],
      }),
    );
    expect(await within(current).findByText(r.loading)).toBeTruthy();
    expect(getListingRevision).toHaveBeenCalledWith(LISTING_ID, 2);
    expect(within(current).queryByRole("button")).toBeNull();
    expect(startListingRevision).toHaveBeenCalledTimes(1);
  });

  const STARTED = {
    ok: true,
    status: 201,
    replayed: false,
    data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 1 },
  } as const;

  it.each([
    { row: "500", reread: failed(500, "INTERNAL_ERROR") },
    { row: "no answer", reread: { ok: false, kind: "network" } as ApiResult<ListingDetail> },
  ])(
    "listingDetailView_afterStart_rereadFails_pageStaysAndStartSendsAgain: $row: a failed listing re-read after a command keeps the page and enables the panel's command again (K-11, pin (b))",
    async ({ reread }) => {
      const r = en.ListingPublish.revision;
      vi.mocked(startListingRevision).mockReset();
      vi.mocked(startListingRevision).mockResolvedValueOnce(STARTED).mockResolvedValueOnce(STARTED);
      vi.mocked(getListing)
        .mockResolvedValueOnce(answered({ ...DETAIL, openRevisionNo: null }))
        .mockResolvedValueOnce(reread)
        .mockReturnValueOnce(new Promise<never>(() => undefined));
      renderView();

      const current = await screen.findByRole("region", { name: r.heading });
      fireEvent.click(within(current).getByRole("button", { name: r.start }));
      await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect((within(current).queryByRole("button", { name: r.start }) as HTMLButtonElement | null)?.disabled).toBe(false),
      );
      expect(screen.queryByRole("heading", { level: 1, name: "Listing TD-7K3M-Q9TX" })).not.toBeNull();
      expect(screen.queryByText(p.loadFailed)).toBeNull();
      fireEvent.click(within(current).getByRole("button", { name: r.start }));
      await waitFor(() => expect(startListingRevision).toHaveBeenCalledTimes(2));
      expect(startListingRevision).toHaveBeenNthCalledWith(2, LISTING_ID, 0);
    },
  );

  it("listingDetailView_afterStart_rereadNotFound_notFoundShown: a listing re-read after a command that answers 404 shows the not-found answer in place of the page (K-12, pin (c))", async () => {
    const r = en.ListingPublish.revision;
    vi.mocked(startListingRevision).mockReset();
    vi.mocked(startListingRevision).mockResolvedValueOnce(STARTED);
    vi.mocked(getListing)
      .mockResolvedValueOnce(answered({ ...DETAIL, openRevisionNo: null }))
      .mockResolvedValueOnce(failed(404, "NOT_FOUND"));
    renderView();

    const current = await screen.findByRole("region", { name: r.heading });
    fireEvent.click(within(current).getByRole("button", { name: r.start }));
    await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(p.notFound)).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  // E06-S3: the freshness panel on the page, and the listing's data version a record moves (E06S3-D12, P8).

  const r = en.ListingPublish.revision;
  const f = en.ListingPublish.freshness;

  /** The open Draft of DETAIL, as its read answers it at data version 4. */
  const DRAFT: ListingRevisionDetail = {
    listingId: LISTING_ID,
    revisionNo: 1,
    status: "DRAFT",
    createdAt: "2026-11-20T03:15:00Z",
    updatedAt: "2026-11-21T03:15:00Z",
    title: "Phòng trọ",
    description: null,
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
    termsSnapshot: null,
    unitSnapshot: null,
    submittedAt: null,
    dataVersion: 4,
    problems: [],
  };
  const NO_RECORD: ListingFreshness = {
    listingId: LISTING_ID,
    confirmedOn: null,
    reconfirmFrom: null,
    validThrough: null,
    reconfirmationDue: false,
    deadlinePassed: false,
    latest: null,
  };
  const revisionRead = (detail: ListingRevisionDetail): ApiResult<ListingRevisionDetail> => ({ ok: true, status: 200, replayed: false, data: detail });
  const freshnessRead = (data: ListingFreshness): ApiResult<ListingFreshness> => ({ ok: true, status: 200, replayed: false, data });
  const recorded = (dataVersion: number): ApiResult<ListingFreshnessRecorded> => ({
    ok: true,
    status: 201,
    replayed: false,
    data: { listingId: LISTING_ID, dataVersion, valid: true },
  });
  const refusedWith = <T,>(status: number, code: string): ApiResult<T> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });
  const never = <T,>() => new Promise<T>(() => undefined);

  /** Every edge call a new case drives, reset at its start and end: the factory's reads that never settle come back. */
  const resetEdge = () => {
    for (const call of [startListingRevision, getListingRevision, saveListingRevisionContent, getListingFreshness, recordListingFreshness]) {
      vi.mocked(call).mockReset();
    }
  };
  /** Lets every answer already given reach the screen. */
  const settle = () => act(async () => new Promise<void>((done) => setTimeout(done, 0)));

  const current = () => screen.getByRole("region", { name: r.heading });
  const freshness = () => screen.getByRole("region", { name: f.heading });
  const titleValue = () => (within(current()).queryByRole("textbox", { name: r.title }) as HTMLInputElement | null)?.value;
  /** Whether a button is held: disabled itself or inside a disabled fieldset (`:disabled`). */
  const held = (region: HTMLElement, name: string) => within(region).queryByRole("button", { name })?.matches(":disabled");
  /** A choice of the record form, or null when the form or its group is not shown. */
  const choice = (groupName: string, name: string) => {
    const group = within(freshness()).queryByRole("group", { name: groupName });
    return group === null ? null : (within(group).queryByRole("radio", { name }) as HTMLInputElement | null);
  };
  /** Opens the record form and chooses a phone call, still available, both answers yes. */
  async function openCompleteRecord() {
    fireEvent.click(await within(freshness()).findByRole("button", { name: f.record }));
    for (const [group, name] of [
      [f.form.channel, f.channels.CALL],
      [f.form.outcome, f.outcomes.AVAILABLE],
      [f.form.termsQuestion, f.form.termsYes],
      [f.form.unitQuestion, f.form.unitUnchangedYes],
    ] as const) {
      fireEvent.click(choice(group, name) as HTMLInputElement);
    }
  }
  const saveContact = () => within(freshness()).queryByRole("button", { name: f.form.save });

  it("listingDetailView_ready_freshnessPanelBetweenHeaderAndRevision: the 'Freshness' region sits between the header and 'Current revision'", async () => {
    vi.mocked(getListing).mockResolvedValueOnce(answered(DETAIL));
    renderView();

    const heading = await screen.findByRole("heading", { level: 1, name: "Listing TD-7K3M-Q9TX" });
    const panel = screen.getByRole("region", { name: f.heading });
    const revision = screen.getByRole("region", { name: r.heading });
    expect([
      Boolean(heading.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING),
      Boolean(panel.compareDocumentPosition(revision) & Node.DOCUMENT_POSITION_FOLLOWING),
    ]).toEqual([true, true]);
  });

  it("listingDetailView_ready_publicationBetweenFreshnessAndCurrentRevision: the 'Publication' region sits between 'Freshness' and 'Current revision', reads the listing's publication, and reads it again on a re-read of the page (E06-S6)", async () => {
    resetEdge();
    try {
      vi.mocked(getListingPublication).mockClear();
      const freshnessAnswer = deferred<ApiResult<ListingFreshness>>();
      vi.mocked(getListing).mockResolvedValueOnce(answered(DETAIL)).mockReturnValueOnce(never());
      vi.mocked(getListingRevision).mockReturnValueOnce(never());
      vi.mocked(getListingFreshness).mockReturnValueOnce(freshnessAnswer.promise);
      renderView();

      const publication = await screen.findByRole("region", { name: en.ListingPublish.publication.title });
      const panel = screen.getByRole("region", { name: f.heading });
      const revision = screen.getByRole("region", { name: r.heading });
      expect([
        Boolean(panel.compareDocumentPosition(publication) & Node.DOCUMENT_POSITION_FOLLOWING),
        Boolean(publication.compareDocumentPosition(revision) & Node.DOCUMENT_POSITION_FOLLOWING),
      ]).toEqual([true, true]);
      expect(getListingPublication).toHaveBeenCalledWith(LISTING_ID);
      expect(getListingPublication).toHaveBeenCalledTimes(1);
      // The freshness read's 404 reads the listing again: the section reads its publication again, still in place.
      freshnessAnswer.resolve(refusedWith(404, "NOT_FOUND"));
      await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(getListingPublication).toHaveBeenCalledTimes(2));
      expect(within(publication).getByText(en.ListingPublish.publication.loading)).toBeTruthy();
    } finally {
      resetEdge();
    }
  });

  it("listingDetailView_notRecorderOrArchived_noRecordButton: 'Record a contact' only for the assigned Sale of a listing that is not archived (FR-12)", async () => {
    resetEdge();
    try {
      vi.mocked(getListingFreshness)
        .mockResolvedValueOnce(freshnessRead(NO_RECORD))
        .mockResolvedValueOnce(freshnessRead(NO_RECORD))
        .mockResolvedValueOnce(freshnessRead(NO_RECORD));
      vi.mocked(getListingRevision).mockReturnValueOnce(never()).mockReturnValueOnce(never()).mockReturnValueOnce(never());
      const shown: boolean[] = [];
      for (const detail of [DETAIL, { ...DETAIL, viewerIsAssignedSale: false }, { ...DETAIL, state: "ARCHIVED" as const }]) {
        vi.mocked(getListing).mockResolvedValueOnce(answered(detail));
        const view = renderView();
        await within(await screen.findByRole("region", { name: f.heading })).findByText(f.none);
        shown.push(within(freshness()).queryByRole("button", { name: f.record }) !== null);
        view.unmount();
      }
      expect(shown[0]).toBe(true);
      expect(shown[1]).toBe(false);
      expect(shown[2]).toBe(false);
    } finally {
      resetEdge();
    }
  });

  it("listingDetailView_recordThenSave_saveSendsNewVersionKeepsTitle: a title typed in the Draft stays through a record, and the next save sends the version the record moved (FR-12)", async () => {
    resetEdge();
    try {
      const listingReread = deferred<ApiResult<ListingDetail>>();
      const outsideRead = deferred<ApiResult<ListingRevisionDetail>>();
      vi.mocked(getListing)
        .mockResolvedValueOnce(answered({ ...DETAIL, dataVersion: 4 }))
        .mockReturnValueOnce(listingReread.promise)
        .mockReturnValueOnce(never());
      vi.mocked(getListingRevision).mockResolvedValueOnce(revisionRead(DRAFT)).mockReturnValueOnce(outsideRead.promise).mockReturnValueOnce(never());
      vi.mocked(getListingFreshness).mockResolvedValueOnce(freshnessRead(NO_RECORD)).mockReturnValueOnce(never());
      vi.mocked(recordListingFreshness).mockResolvedValueOnce(recorded(5));
      vi.mocked(saveListingRevisionContent).mockImplementationOnce(async (_id, _number, body) =>
        body.dataVersion === 5
          ? { ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 6 } }
          : refusedWith(409, "CONCURRENT_MODIFICATION"),
      );
      renderView();

      fireEvent.change(await within(await screen.findByRole("region", { name: r.heading })).findByRole("textbox", { name: r.title }), {
        target: { value: "Phòng trọ của tôi gần chợ" },
      });
      await openCompleteRecord();
      fireEvent.click(saveContact() as HTMLElement);
      await settle();
      expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");

      outsideRead.resolve(revisionRead({ ...DRAFT, dataVersion: 5 }));
      await settle();
      expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");
      expect(held(current(), r.saveDraft)).toBe(true);

      listingReread.resolve(answered({ ...DETAIL, dataVersion: 5 }));
      await settle();
      expect(held(current(), r.saveDraft)).toBe(false);
      expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");

      fireEvent.click(within(current()).getByRole("button", { name: r.saveDraft }));
      await waitFor(() => expect(saveListingRevisionContent).toHaveBeenCalledTimes(1));
      const body = vi.mocked(saveListingRevisionContent).mock.calls[0]?.[2];
      expect(body?.dataVersion).toBe(5);
      expect(body?.title).toBe("Phòng trọ của tôi gần chợ");
      await settle();
      expect(within(current()).queryByText(r.answers.concurrent)).toBeNull();
    } finally {
      resetEdge();
    }
  });

  it.each([
    { row: "500", reread: failed(500, "INTERNAL_ERROR") },
    { row: "no answer", reread: { ok: false, kind: "network" } as ApiResult<ListingDetail> },
  ])(
    "listingDetailView_afterRecord_rereadFails_bothPanelsUnlocked: $row: a failed listing re-read after a record keeps the page and unlocks 'Save contact' and the revision panel (FR-12, SV-333 (4))",
    async ({ reread }) => {
      resetEdge();
      try {
        vi.mocked(getListing).mockResolvedValueOnce(answered({ ...DETAIL, dataVersion: 4 })).mockResolvedValueOnce(reread);
        vi.mocked(getListingRevision).mockResolvedValueOnce(revisionRead(DRAFT)).mockResolvedValueOnce(revisionRead({ ...DRAFT, dataVersion: 5 }));
        vi.mocked(getListingFreshness).mockResolvedValueOnce(freshnessRead(NO_RECORD)).mockResolvedValueOnce(freshnessRead(NO_RECORD));
        vi.mocked(recordListingFreshness).mockResolvedValueOnce(recorded(5));
        renderView();

        await within(await screen.findByRole("region", { name: r.heading })).findByRole("textbox", { name: r.title });
        await openCompleteRecord();
        fireEvent.click(saveContact() as HTMLElement);
        await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
        await settle();
        expect([screen.queryByRole("heading", { level: 1, name: "Listing TD-7K3M-Q9TX" }) !== null, screen.queryByText(p.loadFailed) !== null]).toEqual([
          true,
          false,
        ]);
        await openCompleteRecord();
        expect(saveContact()?.matches(":disabled")).toBe(false);
        expect(held(current(), r.saveDraft)).toBe(false);
      } finally {
        resetEdge();
      }
    },
  );

  it("listingDetailView_afterRevisionSave_saveContactWaitsForListingReread: after a revision command 'Save contact' waits for the listing re-read, then sends its data version (FR-12)", async () => {
    resetEdge();
    try {
      const listingReread = deferred<ApiResult<ListingDetail>>();
      vi.mocked(getListing)
        .mockResolvedValueOnce(answered({ ...DETAIL, dataVersion: 4 }))
        .mockReturnValueOnce(listingReread.promise)
        .mockReturnValueOnce(never());
      vi.mocked(getListingRevision).mockResolvedValueOnce(revisionRead(DRAFT)).mockResolvedValueOnce(revisionRead({ ...DRAFT, dataVersion: 5 })).mockReturnValueOnce(never());
      vi.mocked(getListingFreshness).mockResolvedValueOnce(freshnessRead(NO_RECORD)).mockReturnValueOnce(never());
      vi.mocked(saveListingRevisionContent).mockResolvedValueOnce({
        ok: true,
        status: 200,
        replayed: false,
        data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 5 },
      });
      vi.mocked(recordListingFreshness).mockResolvedValueOnce(recorded(6));
      renderView();

      await within(await screen.findByRole("region", { name: r.heading })).findByRole("textbox", { name: r.title });
      await openCompleteRecord();
      fireEvent.click(within(current()).getByRole("button", { name: r.saveDraft }));
      await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
      fireEvent.click(saveContact() as HTMLElement);
      await settle();
      expect(recordListingFreshness).not.toHaveBeenCalled();
      expect(saveContact()?.matches(":disabled")).toBe(true);

      listingReread.resolve(answered({ ...DETAIL, dataVersion: 5 }));
      await settle();
      expect(saveContact()?.matches(":disabled")).toBe(false);
      fireEvent.click(saveContact() as HTMLElement);
      await waitFor(() => expect(recordListingFreshness).toHaveBeenCalledTimes(1));
      expect(vi.mocked(recordListingFreshness).mock.calls[0]?.[1]).toMatchObject({ dataVersion: 5 });
    } finally {
      resetEdge();
    }
  });

  it("listingDetailView_recordConcurrent_rereadKeepsValuesSendsNewVersion: a record's 409 CONCURRENT_MODIFICATION re-reads the listing as a record's, keeps the choices and sends the new version", async () => {
    resetEdge();
    try {
      const listingReread = deferred<ApiResult<ListingDetail>>();
      vi.mocked(getListing)
        .mockResolvedValueOnce(answered({ ...DETAIL, dataVersion: 5 }))
        .mockReturnValueOnce(listingReread.promise)
        .mockReturnValueOnce(never());
      vi.mocked(getListingRevision).mockResolvedValueOnce(revisionRead({ ...DRAFT, dataVersion: 5 })).mockReturnValueOnce(never());
      vi.mocked(getListingFreshness).mockResolvedValueOnce(freshnessRead(NO_RECORD)).mockReturnValueOnce(never());
      vi.mocked(recordListingFreshness).mockResolvedValueOnce(refusedWith(409, "CONCURRENT_MODIFICATION")).mockResolvedValueOnce(recorded(7));
      renderView();

      await within(await screen.findByRole("region", { name: r.heading })).findByRole("textbox", { name: r.title });
      await openCompleteRecord();
      fireEvent.click(saveContact() as HTMLElement);
      await settle();
      expect(getListing).toHaveBeenCalledTimes(2);
      expect(saveContact()?.matches(":disabled")).toBe(true);
      expect(held(current(), r.saveDraft)).toBe(true);
      expect(getListingRevision).toHaveBeenCalledTimes(1);

      listingReread.resolve(answered({ ...DETAIL, dataVersion: 6 }));
      await settle();
      expect([
        choice(f.form.channel, f.channels.CALL)?.checked,
        choice(f.form.outcome, f.outcomes.AVAILABLE)?.checked,
        choice(f.form.termsQuestion, f.form.termsYes)?.checked,
        choice(f.form.unitQuestion, f.form.unitUnchangedYes)?.checked,
      ]).toEqual([true, true, true, true]);
      fireEvent.click(saveContact() as HTMLElement);
      await settle();
      expect(vi.mocked(recordListingFreshness).mock.calls[1]?.[1]).toMatchObject({ dataVersion: 6 });
    } finally {
      resetEdge();
    }
  });

  it("listingDetailView_freshnessNotFound_listingReadAgain: a 404 of the freshness read makes the page read the listing again, a plain re-read", async () => {
    resetEdge();
    try {
      vi.mocked(getListing).mockResolvedValueOnce(answered(DETAIL)).mockReturnValueOnce(never());
      vi.mocked(getListingRevision).mockResolvedValueOnce(revisionRead(DRAFT)).mockReturnValueOnce(never());
      vi.mocked(getListingFreshness).mockResolvedValueOnce(refusedWith(404, "NOT_FOUND"));
      renderView();

      await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
      await settle();
      expect(getListingRevision).toHaveBeenCalledTimes(1);
    } finally {
      resetEdge();
    }
  });

  it("listingDetailView_recordNotFound_listingReadAgain: a 404 of a record makes the page read the listing again, a plain re-read", async () => {
    resetEdge();
    try {
      vi.mocked(getListing).mockResolvedValueOnce(answered(DETAIL)).mockReturnValueOnce(never());
      vi.mocked(getListingRevision).mockResolvedValueOnce(revisionRead(DRAFT)).mockReturnValueOnce(never());
      vi.mocked(getListingFreshness).mockResolvedValueOnce(freshnessRead(NO_RECORD)).mockReturnValueOnce(never());
      vi.mocked(recordListingFreshness).mockResolvedValueOnce(refusedWith(404, "NOT_FOUND"));
      renderView();

      await within(await screen.findByRole("region", { name: r.heading })).findByRole("textbox", { name: r.title });
      await openCompleteRecord();
      fireEvent.click(saveContact() as HTMLElement);
      await waitFor(() => expect(getListing).toHaveBeenCalledTimes(2));
      await settle();
      expect(getListingRevision).toHaveBeenCalledTimes(1);
    } finally {
      resetEdge();
    }
  });
});

describe("ListingDetailView and the latest review (listing-publish E06-S4, spec section 6, E06S4-D17, P12)", () => {
  const latest = en.ListingPublish.decision.heading;
  /** A listing whose revision 2 was returned and whose revision 3 is the open Draft copied from it. */
  const DECIDED: ListingDetail = {
    ...DETAIL,
    dataVersion: 8,
    openRevisionNo: 3,
    revisions: [
      { revisionNo: 3, status: "DRAFT", createdAt: "2026-11-22T04:00:00Z" },
      { revisionNo: 2, status: "NEEDS_CHANGES", createdAt: "2026-11-21T03:15:00Z" },
      { revisionNo: 1, status: "CANCELLED", createdAt: "2026-11-20T03:15:00Z" },
    ],
  };

  beforeEach(() => {
    vi.mocked(getListing).mockReset();
    vi.mocked(getListingRevisionDecision).mockReset();
    vi.mocked(getListingRevisionDecision).mockReturnValue(new Promise(() => undefined));
  });

  it("listingDetailView_decidedRevision_mountsDecisionSection: a listed Needs changes revision mounts 'Latest review' between 'Current revision' and 'Revisions', reading that revision's decision, also while a Draft is open", async () => {
    vi.mocked(getListing).mockResolvedValueOnce(answered(DECIDED));
    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce({
      ok: true,
      status: 200,
      replayed: false,
      data: {
        outcome: "NEEDS_CHANGES",
        decidedAt: "2026-11-22T03:00:00Z",
        checklistVersion: null,
        changeReasons: ["MISSING_INFORMATION"],
        rejectionGroup: null,
        note: "Thiếu diện tích.",
      },
    });
    renderView();

    const section = await screen.findByRole("region", { name: latest });
    const current = screen.getByRole("region", { name: en.ListingPublish.revision.heading });
    const revisions = screen.getByRole("region", { name: p.revisions });
    expect(current.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(revisions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getListingRevisionDecision).toHaveBeenCalledWith(LISTING_ID, 2);
    expect(await within(section).findByText("Thiếu diện tích.")).toBeTruthy();
    expect(within(section).queryByRole("button", { name: en.ListingPublish.decision.copy })).toBeNull();
  });

  it("listingDetailView_noDecidedRevision_noDecisionSection: with only Draft, Pending review and Cancelled revisions listed there is no 'Latest review' and no decision read", async () => {
    vi.mocked(getListing).mockResolvedValueOnce(
      answered({
        ...DETAIL,
        openRevisionNo: 3,
        revisions: [
          { revisionNo: 3, status: "PENDING_REVIEW", createdAt: "2026-11-22T04:00:00Z" },
          { revisionNo: 2, status: "CANCELLED", createdAt: "2026-11-21T03:15:00Z" },
          { revisionNo: 1, status: "DRAFT", createdAt: "2026-11-20T03:15:00Z" },
        ],
      }),
    );
    renderView();

    expect(await screen.findByRole("region", { name: p.revisions })).toBeTruthy();
    expect(screen.queryByRole("region", { name: latest })).toBeNull();
    expect(getListingRevisionDecision).not.toHaveBeenCalled();
  });
});
