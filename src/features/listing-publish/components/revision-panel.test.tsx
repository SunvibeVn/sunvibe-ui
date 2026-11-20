import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
});
