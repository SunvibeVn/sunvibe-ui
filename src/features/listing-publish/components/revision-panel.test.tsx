import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { RevisionPanelInput } from "../lib/revision-model";
import type { ListingRevisionChange, ListingRevisionDetail, ListingTerms } from "../types";

// The edge only: the seven revision calls, so no request leaves the test.
vi.mock("../services/revision-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/revision-api")>()),
  getListingRevision: vi.fn(),
  startListingRevision: vi.fn(),
  saveListingRevisionContent: vi.fn(),
  captureListingRevisionTerms: vi.fn(),
  submitListingRevision: vi.fn(),
  withdrawListingRevision: vi.fn(),
  getListingTermsSources: vi.fn(),
}));

import {
  captureListingRevisionTerms,
  getListingRevision,
  getListingTermsSources,
  saveListingRevisionContent,
  startListingRevision,
  submitListingRevision,
  withdrawListingRevision,
} from "../services/revision-api";

import { RevisionPanel } from "./revision-panel";

const r = en.ListingPublish.revision;
const a = r.answers;
const LISTING_ID = "01JG000000000000000000000L";

/** A Draft with a title only, as RD-1's read answers it. */
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
  problems: [
    { part: "TITLE", rule: "TOO_SHORT" },
    { part: "DESCRIPTION", rule: "REQUIRED" },
    { part: "TERMS", rule: "REQUIRED" },
  ],
};

/** The same revision submitted and locked. */
const PENDING: ListingRevisionDetail = {
  ...DRAFT,
  status: "PENDING_REVIEW",
  title: "Phòng trọ gần trường đại học",
  description: "Phòng rộng.\nGần chợ.",
  submittedAt: "2026-11-21T03:00:00Z",
  dataVersion: 6,
  problems: [],
};

/** E05's terms in effect, the one source the Draft's terms can be taken from. */
const TERMS: ListingTerms = {
  monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
  deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
  minimumTermMonths: 6,
  paymentPeriodMonths: 1,
  mandatoryFees: [],
};

const DRAFTER: RevisionPanelInput = { openRevisionNo: 1, dataVersion: 4, viewerMayDraft: true };
const MANAGER: RevisionPanelInput = { openRevisionNo: 1, dataVersion: 4, viewerMayDraft: false };

const answered = (data: ListingRevisionDetail): ApiResult<ListingRevisionDetail> => ({ ok: true, status: 200, replayed: false, data });
const change = (status: ListingRevisionChange["status"], dataVersion: number): ApiResult<ListingRevisionChange> => ({
  ok: true,
  status: 200,
  replayed: false,
  data: { listingId: LISTING_ID, revisionNo: 1, status, dataVersion },
});
const refused = (status: number, code: string, fields: string[] = []): ApiResult<ListingRevisionChange> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "Fixed server message." })),
});

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderPanel(panel: RevisionPanelInput, onListingChanged = vi.fn<() => void>()) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <RevisionPanel listingId={LISTING_ID} panel={panel} listingRereading={false} onListingChanged={onListingChanged} />
    </NextIntlClientProvider>,
  );
  return { ...view, onListingChanged };
}

const region = () => screen.getByRole("region", { name: r.heading });

describe("RevisionPanel (listing-publish US-2 AC-1 to AC-6, spec section 6, RD-13)", () => {
  beforeEach(() => {
    for (const call of [
      getListingRevision,
      startListingRevision,
      saveListingRevisionContent,
      submitListingRevision,
      withdrawListingRevision,
      getListingTermsSources,
    ]) {
      vi.mocked(call).mockReset();
    }
    vi.mocked(getListingTermsSources).mockReturnValue(new Promise(() => undefined));
  });

  it("revisionPanel_loading_loadingSentence: a region with its own heading reads the open revision, 'Loading the revision…' meanwhile", () => {
    vi.mocked(getListingRevision).mockReturnValueOnce(new Promise(() => undefined));
    renderPanel(DRAFTER);

    expect(within(region()).getByRole("heading", { level: 2, name: r.heading })).toBeTruthy();
    expect(within(region()).getByRole("status").textContent).toBe(r.loading);
    expect(getListingRevision).toHaveBeenCalledTimes(1);
    expect(getListingRevision).toHaveBeenCalledWith(LISTING_ID, 1);
  });

  it("revisionPanel_readFails_tryAgainReads: a failed read says so with Try again, which reads again", async () => {
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] })
      .mockResolvedValueOnce(answered(DRAFT));
    renderPanel(DRAFTER);

    expect(await within(region()).findByText(r.loadFailed)).toBeTruthy();
    fireEvent.click(within(region()).getByRole("button", { name: r.retry }));
    expect(await within(region()).findByRole("textbox", { name: r.title })).toBeTruthy();
    expect(within(region()).queryByText(r.loadFailed)).toBeNull();
    expect(getListingRevision).toHaveBeenCalledTimes(2);
  });

  it("revisionPanel_readNotFound_listingReread: a 404 read says the revision is no longer available and reads the listing again once", async () => {
    vi.mocked(getListingRevision).mockResolvedValueOnce({ ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] });
    const { onListingChanged } = renderPanel(DRAFTER);

    expect(await within(region()).findByText(a.notFound)).toBeTruthy();
    expect(onListingChanged).toHaveBeenCalledTimes(1);
    expect(getListingRevision).toHaveBeenCalledTimes(1);
  });

  it("revisionPanel_noOpenRevision_startOfferedOnlyToDrafter: no open revision reads 'No draft is open.'; only the assigned Sale is offered 'Start a new draft', sent once", async () => {
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(startListingRevision).mockReturnValueOnce(answer.promise);
    const { onListingChanged, unmount } = renderPanel({ openRevisionNo: null, dataVersion: 9, viewerMayDraft: true });

    expect(within(region()).getByText(r.none)).toBeTruthy();
    fireEvent.click(within(region()).getByRole("button", { name: r.start }));
    const starting = within(region()).getByRole("button", { name: r.starting }) as HTMLButtonElement;
    expect(starting.disabled).toBe(true);
    fireEvent.click(starting);
    expect(startListingRevision).toHaveBeenCalledTimes(1);
    expect(startListingRevision).toHaveBeenCalledWith(LISTING_ID, 9);
    answer.resolve({ ok: true, status: 201, replayed: false, data: { listingId: LISTING_ID, revisionNo: 2, status: "DRAFT", dataVersion: 10 } });
    await waitFor(() => expect(onListingChanged).toHaveBeenCalledTimes(1));
    expect(getListingRevision).not.toHaveBeenCalled();
    unmount();

    renderPanel({ openRevisionNo: null, dataVersion: 9, viewerMayDraft: false });
    expect(within(region()).getByText(r.none)).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
  });

  it("revisionPanel_draftForDrafter_formWithProblems: a Draft for the assigned Sale is the form with its values, the read's problems and Submit for review", async () => {
    vi.mocked(getListingRevision).mockResolvedValueOnce(answered(DRAFT));
    renderPanel(DRAFTER);

    const title = (await within(region()).findByRole("textbox", { name: r.title })) as HTMLInputElement;
    expect(title.value).toBe("Phòng trọ");
    expect((within(region()).getByRole("textbox", { name: r.description }) as HTMLTextAreaElement).value).toBe("");
    expect((within(region()).getByRole("checkbox", { name: r.features.labels.airConditioner }) as HTMLInputElement).checked).toBe(true);
    expect(within(region()).getByText("Revision 1: Draft")).toBeTruthy();
    const problems = within(region()).getByRole("list", { name: r.problems.heading });
    expect(within(problems).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "The title needs at least 15 characters.",
      "Add a description.",
      "Take a terms snapshot.",
    ]);
    expect(within(region()).getByRole("button", { name: r.saveDraft })).toBeTruthy();
    expect(within(region()).getByRole("button", { name: r.submit })).toBeTruthy();
    expect(within(region()).getByText(r.terms.none)).toBeTruthy();
    expect(within(region()).queryByRole("button", { name: r.withdraw })).toBeNull();
  });

  it("revisionPanel_draftForManager_readOnly: a Draft for anyone else is read-only, with no command", async () => {
    vi.mocked(getListingRevision).mockResolvedValueOnce(answered(DRAFT));
    renderPanel(MANAGER);

    expect(await within(region()).findByText("Phòng trọ")).toBeTruthy();
    expect(within(region()).getByText("Revision 1: Draft")).toBeTruthy();
    expect(within(region()).queryByRole("textbox")).toBeNull();
    expect(within(region()).queryByRole("button")).toBeNull();
    expect(getListingTermsSources).not.toHaveBeenCalled();
  });

  it("revisionPanel_pending_lockedWithWithdrawConfirm: Pending review is locked; Withdraw asks first, 'Keep it' sends nothing, 'Withdraw revision' sends once", async () => {
    vi.mocked(getListingRevision).mockResolvedValue(answered(PENDING));
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(withdrawListingRevision).mockReturnValueOnce(answer.promise);
    const { onListingChanged } = renderPanel({ ...DRAFTER, dataVersion: 6 });

    expect(await within(region()).findByText(/^Submitted Nov 21, 2026/)).toBeTruthy();
    expect(within(region()).getByText("Revision 1: Pending review")).toBeTruthy();
    expect(within(region()).queryByRole("button", { name: r.saveDraft })).toBeNull();
    expect(within(region()).queryByRole("textbox")).toBeNull();

    fireEvent.click(within(region()).getByRole("button", { name: r.withdraw }));
    expect(within(region()).getByText(r.withdrawConfirm)).toBeTruthy();
    expect(document.activeElement).toBe(within(region()).getByRole("button", { name: r.withdrawNo }));
    fireEvent.click(within(region()).getByRole("button", { name: r.withdrawNo }));
    expect(within(region()).queryByText(r.withdrawConfirm)).toBeNull();
    expect(withdrawListingRevision).not.toHaveBeenCalled();

    fireEvent.click(within(region()).getByRole("button", { name: r.withdraw }));
    fireEvent.click(within(region()).getByRole("button", { name: r.withdrawYes }));
    const withdrawing = within(region()).getByRole("button", { name: r.withdrawing }) as HTMLButtonElement;
    expect(withdrawing.disabled).toBe(true);
    fireEvent.click(withdrawing);
    expect(withdrawListingRevision).toHaveBeenCalledTimes(1);
    expect(withdrawListingRevision).toHaveBeenCalledWith(LISTING_ID, 1, 6);

    answer.resolve(change("CANCELLED", 7));
    await waitFor(() => expect(onListingChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(region()).queryByText(r.withdrawConfirm)).toBeNull());
  });

  it("revisionPanel_pendingForManager_noWithdraw: a Pending review revision offers no Withdraw to anyone but the assigned Sale", async () => {
    vi.mocked(getListingRevision).mockResolvedValueOnce(answered(PENDING));
    renderPanel(MANAGER);

    expect(await within(region()).findByText(/^Submitted Nov 21, 2026/)).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
  });

  type Row = { row: string; button: "save" | "submit"; result: ApiResult<ListingRevisionChange>; sentence: string | null };
  const rows: Row[] = [
    { row: "400 title entry", button: "save", result: refused(400, "VALIDATION_FAILED", ["title"]), sentence: a.validationTitle },
    { row: "400 description entry", button: "save", result: refused(400, "VALIDATION_FAILED", ["description"]), sentence: a.validationDescription },
    { row: "any other 400", button: "save", result: refused(400, "MALFORMED_REQUEST"), sentence: a.validationOther },
    { row: "403 FORBIDDEN", button: "save", result: refused(403, "FORBIDDEN"), sentence: a.forbidden },
    { row: "404 NOT_FOUND", button: "save", result: refused(404, "NOT_FOUND"), sentence: a.notFound },
    { row: "409 LISTING_ARCHIVED", button: "submit", result: refused(409, "LISTING_ARCHIVED"), sentence: a.archived },
    { row: "409 CONCURRENT_MODIFICATION", button: "save", result: refused(409, "CONCURRENT_MODIFICATION"), sentence: a.concurrent },
    { row: "409 REVISION_NOT_DRAFT", button: "submit", result: refused(409, "REVISION_NOT_DRAFT"), sentence: a.notDraft },
    { row: "409 REVISION_NOT_PENDING", button: "submit", result: refused(409, "REVISION_NOT_PENDING"), sentence: a.notPending },
    { row: "409 OPEN_REVISION_EXISTS", button: "submit", result: refused(409, "OPEN_REVISION_EXISTS"), sentence: a.openExists },
    { row: "409 TERMS_SOURCE_ABSENT", button: "save", result: refused(409, "TERMS_SOURCE_ABSENT"), sentence: a.termsAbsent },
    {
      row: "422 REVISION_NOT_SUBMITTABLE",
      button: "submit",
      result: refused(422, "REVISION_NOT_SUBMITTABLE", ["description.REQUIRED"]),
      sentence: `${a.notSubmittable}Add a description.`,
    },
    { row: "500", button: "submit", result: refused(500, "INTERNAL_ERROR"), sentence: a.failed },
    { row: "no answer", button: "save", result: { ok: false, kind: "network" }, sentence: a.failed },
    { row: "an unknown 409 code", button: "submit", result: refused(409, "SOMETHING_NEW"), sentence: a.failed },
    { row: "session signed out", button: "save", result: { ok: false, kind: "signed-out" }, sentence: null },
    { row: "session unavailable", button: "submit", result: { ok: false, kind: "unavailable" }, sentence: null },
  ];

  it.each(rows)("revisionPanel_commandAnswer_itsSentence: $row", async ({ button, result, sentence }) => {
    vi.mocked(getListingRevision).mockResolvedValue(answered(DRAFT));
    const command = button === "save" ? saveListingRevisionContent : submitListingRevision;
    vi.mocked(command).mockResolvedValueOnce(result);
    const { onListingChanged } = renderPanel(DRAFTER);

    fireEvent.click(await within(region()).findByRole("button", { name: button === "save" ? r.saveDraft : r.submit }));
    await waitFor(() => expect(command).toHaveBeenCalledTimes(1));
    if (sentence === null) {
      await waitFor(() => expect((within(region()).getByRole("button", { name: r.saveDraft }) as HTMLButtonElement).disabled).toBe(false));
      expect(within(region()).queryByRole("alert")).toBeNull();
      expect(onListingChanged).not.toHaveBeenCalled();
    } else {
      expect((await within(region()).findByRole("alert")).textContent).toBe(sentence);
      expect(onListingChanged).toHaveBeenCalledTimes(1);
    }
  });

  it("revisionPanel_unprocessable_listFocusedWithSentences: a refused submission lists one sentence per entry in the alert, and the list takes the focus", async () => {
    vi.mocked(getListingRevision).mockResolvedValue(answered(DRAFT));
    vi.mocked(submitListingRevision).mockResolvedValueOnce(
      refused(422, "REVISION_NOT_SUBMITTABLE", ["title.TOO_SHORT", "description.REQUIRED", "terms.REQUIRED", "title.PHONE_NUMBER"]),
    );
    renderPanel(DRAFTER);

    fireEvent.click(await within(region()).findByRole("button", { name: r.submit }));
    const alert = await within(region()).findByRole("alert");
    const list = within(alert).getByRole("list", { name: a.notSubmittable });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "The title needs at least 15 characters.",
      "Add a description.",
      "Take a terms snapshot.",
      "The title holds what reads as a phone number.",
    ]);
    expect(document.activeElement).toBe(list);
  });

  it("revisionPanel_afterCommand_listingAndRevisionReread: after a command the listing and the revision read again, the form staying on screen meanwhile", async () => {
    const reread = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevision)
      .mockResolvedValue(answered(PENDING))
      .mockResolvedValueOnce(answered(DRAFT))
      .mockReturnValueOnce(reread.promise);
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(change("DRAFT", 5));
    const { onListingChanged } = renderPanel(DRAFTER);

    fireEvent.change(await within(region()).findByRole("textbox", { name: r.title }), { target: { value: "  Phòng trọ gần trường  " } });
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(getListingRevision).toHaveBeenCalledTimes(2));
    expect(onListingChanged).toHaveBeenCalledTimes(1);
    expect(within(region()).queryByText(r.loading)).toBeNull();
    expect(within(region()).getByRole("textbox", { name: r.title })).toBeTruthy();

    // The read after the save answers the stored text and the new data version, which the next command sends.
    reread.resolve(answered({ ...DRAFT, title: "Phòng trọ gần trường", dataVersion: 5 }));
    await waitFor(() => expect((within(region()).getByRole("textbox", { name: r.title }) as HTMLInputElement).value).toBe("Phòng trọ gần trường"));
    vi.mocked(submitListingRevision).mockResolvedValueOnce(change("PENDING_REVIEW", 6));
    fireEvent.click(within(region()).getByRole("button", { name: r.submit }));
    await waitFor(() => expect(submitListingRevision).toHaveBeenCalledWith(LISTING_ID, 1, 5));
  });

  it("revisionPanel_afterCapture_commandsWaitForReread: after a command no command is sent until the revision's re-read answers, so none carries the old data version", async () => {
    const reread = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevision)
      .mockReturnValue(new Promise(() => undefined))
      .mockResolvedValueOnce(answered(DRAFT))
      .mockReturnValueOnce(reread.promise);
    vi.mocked(getListingTermsSources).mockResolvedValue({ ok: true, status: 200, replayed: false, data: { ended: false, inEffect: TERMS, pending: null } });
    vi.mocked(captureListingRevisionTerms).mockReset();
    vi.mocked(captureListingRevisionTerms).mockResolvedValueOnce(change("DRAFT", 5));
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(change("DRAFT", 6));
    const { onListingChanged } = renderPanel(DRAFTER);

    fireEvent.click(await within(region()).findByRole("button", { name: r.terms.take }));
    await waitFor(() => expect(getListingRevision).toHaveBeenCalledTimes(2));
    expect(captureListingRevisionTerms).toHaveBeenCalledWith(LISTING_ID, 1, 4, "IN_EFFECT");
    expect(onListingChanged).toHaveBeenCalledTimes(1);

    // The capture answered, its re-read has not: the screen still holds data version 4, so every command waits.
    const save = within(region()).getByRole("button", { name: r.saveDraft }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((within(region()).getByRole("button", { name: r.submit }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(region()).getByRole("button", { name: r.terms.taking }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    fireEvent.submit(save.form as HTMLFormElement);
    expect(saveListingRevisionContent).not.toHaveBeenCalled();

    // The re-read answers the snapshot and data version 5, which the next command sends.
    reread.resolve(
      answered({
        ...DRAFT,
        termsSnapshot: { source: "IN_EFFECT", pendingStartDate: null, capturedAt: "2026-11-21T04:00:00Z", terms: TERMS },
        dataVersion: 5,
        problems: DRAFT.problems.filter((problem) => problem.part !== "TERMS"),
      }),
    );
    await waitFor(() => expect((within(region()).getByRole("button", { name: r.saveDraft }) as HTMLButtonElement).disabled).toBe(false));
    expect((within(region()).getByRole("button", { name: r.terms.take }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(saveListingRevisionContent).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveListingRevisionContent).mock.calls[0]?.[2]).toMatchObject({ dataVersion: 5 });
  });

  it("revisionPanel_texts_noOuterPageTexts: the panel repeats none of the page's texts and has no level-1 heading", async () => {
    for (const [detail, panel] of [
      [DRAFT, DRAFTER],
      [DRAFT, MANAGER],
      [PENDING, DRAFTER],
    ] as const) {
      vi.mocked(getListingRevision).mockResolvedValueOnce(answered(detail));
      const { unmount } = renderPanel(panel);
      await within(region()).findByText(/^Revision 1: /);
      const text = region().textContent ?? "";
      for (const outer of ["Unpublished", en.ListingPublish.page.notPublic, "Listing TD-"]) expect(text).not.toContain(outer);
      expect(within(region()).queryByRole("heading", { level: 1 })).toBeNull();
      unmount();
    }
    renderPanel({ openRevisionNo: null, dataVersion: 0, viewerMayDraft: true });
    expect(region().textContent).not.toContain("Unpublished");
  });

  it("revisionPanel_saveConcurrent_adoptsStoredValues: after the panel's save answers 409 CONCURRENT_MODIFICATION, the re-read's stored values replace what is typed (K-2, pin (a))", async () => {
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockResolvedValueOnce(answered({ ...DRAFT, title: "Phòng trọ đã sửa ở tab khác", dataVersion: 5 }));
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(refused(409, "CONCURRENT_MODIFICATION"));
    renderPanel(DRAFTER);

    fireEvent.change(await within(region()).findByRole("textbox", { name: r.title }), { target: { value: "Phòng trọ của tôi gần chợ" } });
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(getListingRevision).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(region()).queryByRole("alert")?.textContent).toBe(a.concurrent));
    await waitFor(() =>
      expect((within(region()).queryByRole("textbox", { name: r.title }) as HTMLInputElement | null)?.value).toBe("Phòng trọ đã sửa ở tab khác"),
    );
  });

  it("revisionPanel_retryAfterFailedRead_showsLoadingLine: 'Try again' after a failed first read empties the panel to its loading line until the read answers (K-7, pin (d))", async () => {
    const held = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] })
      .mockReturnValueOnce(held.promise);
    renderPanel(DRAFTER);

    fireEvent.click(await within(region()).findByRole("button", { name: r.retry }));
    expect(within(region()).queryByRole("status")?.textContent).toBe(r.loading);
    expect(within(region()).queryByText(r.loadFailed)).toBeNull();
    held.resolve(answered(DRAFT));
    await waitFor(() => expect(within(region()).queryByRole("textbox", { name: r.title })).not.toBeNull());
    expect(getListingRevision).toHaveBeenCalledTimes(2);
  });

  // E06S3-D12: after a record the page moves `outsideChange` and holds the panel with `outsideRereading`.

  /** The panel under the page's two props, which `outside` changes as the page would after a record. */
  function renderOutside(panel: RevisionPanelInput) {
    const onListingChanged = vi.fn<() => void>();
    const element = (outsideChange: number, outsideRereading: boolean, input: RevisionPanelInput) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
        <RevisionPanel
          listingId={LISTING_ID}
          panel={input}
          listingRereading={false}
          onListingChanged={onListingChanged}
          outsideChange={outsideChange}
          outsideRereading={outsideRereading}
        />
      </NextIntlClientProvider>
    );
    const view = render(element(0, false, panel));
    const outside = (outsideChange: number, outsideRereading = false, input = panel) => view.rerender(element(outsideChange, outsideRereading, input));
    return { ...view, onListingChanged, outside };
  }

  const titleValue = () => (within(region()).queryByRole("textbox", { name: r.title }) as HTMLInputElement | null)?.value;
  const typeTitle = async (title: string) =>
    fireEvent.change(await within(region()).findByRole("textbox", { name: r.title }), { target: { value: title } });
  /** Whether the button is held: disabled itself or inside the panel's disabled fieldset. */
  const buttonHeld = (name: string) => within(region()).queryByRole("button", { name })?.matches(":disabled");
  const sentenceShown = () => within(region()).queryByText(r.changedMeanwhile) !== null;
  const settle = () => act(async () => new Promise<void>((done) => setTimeout(done, 0)));

  it("revisionPanel_outsideChange_sameValues_keepsTypedNoSentence: a re-read after a record that finds the same stored values keeps what is typed and takes the new version (E06S3-D12 (i))", async () => {
    vi.mocked(getListingRevision).mockResolvedValueOnce(answered(DRAFT)).mockResolvedValueOnce(answered({ ...DRAFT, dataVersion: 5 }));
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(change("DRAFT", 6));
    vi.mocked(getListingRevision).mockReturnValueOnce(new Promise(() => undefined));
    const { outside } = renderOutside(DRAFTER);
    await typeTitle("Phòng trọ của tôi gần chợ");

    outside(1);
    await settle();
    expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");
    expect(sentenceShown()).toBe(false);
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(saveListingRevisionContent).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveListingRevisionContent).mock.calls[0]?.[2]).toMatchObject({ dataVersion: 5, title: "Phòng trọ của tôi gần chợ" });
  });

  it("revisionPanel_outsideChange_heldWhileReading_noPendingLabel: while the re-read after a record or the page's re-read runs, the body is held with what is typed and no pending label, also after an earlier save", async () => {
    const outsideRead = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockResolvedValueOnce(answered({ ...DRAFT, title: "Phòng trọ gần trường", dataVersion: 5 }))
      .mockReturnValueOnce(outsideRead.promise);
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(change("DRAFT", 5));
    const { outside } = renderOutside(DRAFTER);
    await typeTitle("Phòng trọ gần trường");
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(buttonHeld(r.saveDraft)).toBe(false));
    await typeTitle("Phòng trọ gần trường đại học");

    outside(1, true);
    await settle();
    expect(titleValue()).toBe("Phòng trọ gần trường đại học");
    // The draft's save button, whatever its label: held while the reads run.
    const save = within(region()).queryByRole("button", { name: r.saveDraft }) ?? within(region()).queryByRole("button", { name: r.saving });
    expect(save?.matches(":disabled")).toBe(true);
    expect(within(region()).queryByRole("button", { name: r.saving })).toBeNull();
  });

  it("revisionPanel_outsideChange_sameValueGiven_readsNothing: a new outsideChange reads the open revision once; the same value given again reads nothing", async () => {
    vi.mocked(getListingRevision).mockResolvedValueOnce(answered(DRAFT)).mockResolvedValueOnce(answered({ ...DRAFT, dataVersion: 5 }));
    const { outside } = renderOutside(DRAFTER);
    await within(region()).findByRole("textbox", { name: r.title });

    outside(1);
    await settle();
    expect(getListingRevision).toHaveBeenCalledTimes(2);
    outside(1);
    await settle();
    expect(getListingRevision).toHaveBeenCalledTimes(2);
  });

  it("revisionPanel_outsideChange_otherValues_adoptsAndChangedMeanwhile: other stored values are adopted with the status sentence, cleared when the next outside re-read or the next command starts (E06S3-D12 (ii))", async () => {
    const changed = (title: string, dataVersion: number) => answered({ ...DRAFT, title, dataVersion });
    const second = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockResolvedValueOnce(changed("Phòng trọ đã sửa ở tab khác", 5))
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce(changed("Phòng trọ sửa lần nữa ở tab khác", 7))
      .mockReturnValueOnce(new Promise(() => undefined));
    vi.mocked(saveListingRevisionContent).mockReturnValueOnce(new Promise(() => undefined));
    const { outside } = renderOutside(DRAFTER);
    await typeTitle("Phòng trọ của tôi gần chợ");

    outside(1);
    await waitFor(() => expect(titleValue()).toBe("Phòng trọ đã sửa ở tab khác"));
    expect(within(region()).queryAllByRole("status").map((element) => element.textContent)).toContain(r.changedMeanwhile);
    outside(2);
    expect(sentenceShown()).toBe(false);
    second.resolve(changed("Phòng trọ đã sửa ở tab khác", 6));
    await settle();
    expect(sentenceShown()).toBe(false);
    outside(3);
    await waitFor(() => expect(titleValue()).toBe("Phòng trọ sửa lần nữa ở tab khác"));
    expect(sentenceShown()).toBe(true);
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    expect(sentenceShown()).toBe(false);
  });

  it("revisionPanel_outsideChange_readFails_keepsTypedHeldTryAgain: a failed re-read after a record keeps what is typed, holds the body and offers Try again (E06S3-D12 (iii))", async () => {
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] })
      .mockResolvedValueOnce(answered({ ...DRAFT, dataVersion: 5 }));
    const { outside } = renderOutside(DRAFTER);
    await typeTitle("Phòng trọ của tôi gần chợ");

    outside(1);
    await settle();
    expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");
    expect(buttonHeld(r.saveDraft)).toBe(true);
    expect([within(region()).queryByText(r.rereadFailed) !== null, within(region()).queryByRole("button", { name: r.retry }) !== null]).toEqual([
      true,
      true,
    ]);
    expect(sentenceShown()).toBe(false);
    fireEvent.click(within(region()).getByRole("button", { name: r.retry }));
    await waitFor(() => expect(getListingRevision).toHaveBeenCalledTimes(3));
    await settle();
    expect(buttonHeld(r.saveDraft)).toBe(false);
    expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");
  });

  it("revisionPanel_outsideChange_notFound_listingReread: a re-read after a record that answers 404 shows the not-found answer and reads the listing again, as today (E06S3-D12 (iv))", async () => {
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] });
    const { outside, onListingChanged } = renderOutside(DRAFTER);
    await within(region()).findByRole("textbox", { name: r.title });

    outside(1);
    await waitFor(() => expect(within(region()).queryByText(a.notFound)).not.toBeNull());
    expect(onListingChanged).toHaveBeenCalledTimes(1);
  });

  it("revisionPanel_outsideChange_noOpenRevision_noReadStartHeldWhileRereading: with no open revision a record reads nothing, and 'Start a new draft' waits only while the page's re-read runs", async () => {
    vi.mocked(getListingRevision).mockReturnValue(new Promise(() => undefined));
    const none: RevisionPanelInput = { openRevisionNo: null, dataVersion: 9, viewerMayDraft: true };
    const { outside } = renderOutside(none);

    outside(1, true);
    expect(buttonHeld(r.start)).toBe(true);
    outside(1, false);
    expect(buttonHeld(r.start)).toBe(false);
    outside(2, false);
    await settle();
    expect(getListingRevision).not.toHaveBeenCalled();
  });

  it("revisionPanel_ownCommands_noChangedMeanwhileSentence: the panel's own save and its own 409 adopt the stored values with no 'changed meanwhile' sentence", async () => {
    const saveReread = deferred<ApiResult<ListingRevisionDetail>>();
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockReturnValueOnce(saveReread.promise)
      .mockResolvedValueOnce(answered({ ...DRAFT, title: "Phòng trọ đã sửa ở tab khác", dataVersion: 7 }));
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(change("DRAFT", 5)).mockResolvedValueOnce(refused(409, "CONCURRENT_MODIFICATION"));
    renderOutside(DRAFTER);
    await typeTitle("  Phòng trọ gần trường  ");
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(getListingRevision).toHaveBeenCalledTimes(2));
    saveReread.resolve(answered({ ...DRAFT, title: "Phòng trọ gần trường", dataVersion: 5 }));
    await waitFor(() => expect(titleValue()).toBe("Phòng trọ gần trường"));
    expect(sentenceShown()).toBe(false);

    await typeTitle("Phòng trọ của tôi gần chợ");
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(titleValue()).toBe("Phòng trọ đã sửa ở tab khác"));
    expect(sentenceShown()).toBe(false);
  });

  it("revisionPanel_outsideChangeDuringOwnReread_adoptsNoSentence: a record made while the panel's own re-read after its save runs adopts the saved values with no sentence (E06S3-P16)", async () => {
    vi.mocked(getListingRevision)
      .mockResolvedValueOnce(answered(DRAFT))
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(answered({ ...DRAFT, title: "Phòng trọ của tôi gần chợ", dataVersion: 6 }));
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(change("DRAFT", 5)).mockReturnValueOnce(new Promise(() => undefined));
    const { outside } = renderOutside(DRAFTER);
    await typeTitle("  Phòng trọ của tôi gần chợ  ");
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(getListingRevision).toHaveBeenCalledTimes(2));

    outside(1);
    await settle();
    expect(titleValue()).toBe("Phòng trọ của tôi gần chợ");
    expect(sentenceShown()).toBe(false);
    fireEvent.click(within(region()).getByRole("button", { name: r.saveDraft }));
    await waitFor(() => expect(saveListingRevisionContent).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveListingRevisionContent).mock.calls[1]?.[2]).toMatchObject({ dataVersion: 6 });
  });
});
