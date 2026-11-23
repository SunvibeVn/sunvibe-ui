import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingFreshnessRecorded } from "../types";

// The edge only: the freshness calls, so no request leaves the test.
vi.mock("../services/freshness-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/freshness-api")>()),
  getListingFreshness: vi.fn(),
  recordListingFreshness: vi.fn(),
}));

import { recordListingFreshness } from "../services/freshness-api";

import { FreshnessRecordForm } from "./freshness-record-form";

const f = en.ListingPublish.freshness;
const LISTING_ID = "01JG000000000000000000000L";
const AGREEMENT_HREF = "/workspace/brokerage-agreements/01JF000000000000000000000A";

const RECORDED: ApiResult<ListingFreshnessRecorded> = {
  ok: true,
  status: 201,
  replayed: false,
  data: { listingId: LISTING_ID, dataVersion: 5, valid: true },
};
const refused = (status: number, code: string): ApiResult<ListingFreshnessRecorded> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
});

/** Lets every answer already given reach the screen. */
const settle = () => act(async () => new Promise<void>((done) => setTimeout(done, 0)));

type Spies = {
  onDone: ReturnType<typeof vi.fn<() => void>>;
  onCancel: ReturnType<typeof vi.fn<() => void>>;
  onListingChanged: ReturnType<typeof vi.fn<(change: "recorded" | "concurrent" | "gone") => void>>;
};

function formElement(listingRereading: boolean, spies: Spies) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <FreshnessRecordForm
        listingId={LISTING_ID}
        dataVersion={4}
        agreementHref={AGREEMENT_HREF}
        listingRereading={listingRereading}
        onDone={spies.onDone}
        onCancel={spies.onCancel}
        onListingChanged={spies.onListingChanged}
      />
    </NextIntlClientProvider>
  );
}

function renderForm({ listingRereading = false } = {}) {
  const spies: Spies = { onDone: vi.fn(), onCancel: vi.fn(), onListingChanged: vi.fn() };
  const view = render(formElement(listingRereading, spies));
  return { ...view, spies, rerenderWith: (rereading: boolean) => view.rerender(formElement(rereading, spies)) };
}

const group = (name: string) => screen.getByRole("group", { name });
const choose = (groupName: string, name: string) => fireEvent.click(within(group(groupName)).getByRole("radio", { name }));
const radioChecked = (groupName: string, name: string) =>
  (within(group(groupName)).queryByRole("radio", { name }) as HTMLInputElement | null)?.checked;
const saveButton = () => screen.queryByRole("button", { name: f.form.save }) as HTMLButtonElement | null;
const form = () => (screen.getByRole("radio", { name: f.channels.CALL }) as HTMLInputElement).form as HTMLFormElement;

/** Phone call, still available, both answers yes. */
function complete() {
  choose(f.form.channel, f.channels.CALL);
  choose(f.form.outcome, f.outcomes.AVAILABLE);
  choose(f.form.termsQuestion, f.form.termsYes);
  choose(f.form.unitQuestion, f.form.unitUnchangedYes);
}

const HINTS = [f.form.hintUnreachable, f.form.hintNotAvailable, f.form.hintNotValid];
const hintsShown = () => HINTS.filter((hint) => screen.queryByText(hint) !== null);

describe("FreshnessRecordForm (listing-publish US-6 AC-1, AC-6, spec section 6, E06S3-D11, P13)", () => {
  beforeEach(() => {
    vi.mocked(recordListingFreshness).mockReset();
  });

  it("freshnessRecordForm_available_sendsOnlyWithBothAnswers: the body carries the data version and no date; nothing is sent while an answer is missing", async () => {
    vi.mocked(recordListingFreshness).mockResolvedValueOnce(RECORDED);
    const view = renderForm();
    complete();
    fireEvent.click(saveButton() as HTMLButtonElement);
    await settle();
    expect(recordListingFreshness).toHaveBeenCalledWith(LISTING_ID, {
      dataVersion: 4,
      channel: "CALL",
      outcome: "AVAILABLE",
      termsStillApply: true,
      unitUnchanged: true,
      note: null,
    });
    view.unmount();
    vi.mocked(recordListingFreshness).mockReset();

    renderForm();
    choose(f.form.channel, f.channels.CALL);
    choose(f.form.outcome, f.outcomes.AVAILABLE);
    choose(f.form.termsQuestion, f.form.termsYes);
    fireEvent.click(saveButton() as HTMLButtonElement);
    fireEvent.submit(form());
    await settle();
    expect(recordListingFreshness).not.toHaveBeenCalled();
  });

  it("freshnessRecordForm_hints_underResults: each result shows its hint of E06S3-D11; both answers yes show none (FR-15)", () => {
    renderForm();
    const shown: string[][] = [];
    choose(f.form.outcome, f.outcomes.UNREACHABLE);
    shown.push(hintsShown());
    choose(f.form.outcome, f.outcomes.NOT_AVAILABLE);
    shown.push(hintsShown());
    choose(f.form.outcome, f.outcomes.AVAILABLE);
    choose(f.form.termsQuestion, f.form.termsNo);
    choose(f.form.unitQuestion, f.form.unitUnchangedYes);
    shown.push(hintsShown());
    choose(f.form.termsQuestion, f.form.termsYes);
    choose(f.form.unitQuestion, f.form.unitChanged);
    shown.push(hintsShown());
    expect(shown).toEqual([[f.form.hintUnreachable], [f.form.hintNotAvailable], [f.form.hintNotValid], [f.form.hintNotValid]]);

    choose(f.form.unitQuestion, f.form.unitUnchangedYes);
    expect(hintsShown()).toEqual([]);
  });

  it("freshnessRecordForm_notAvailable_promptShown: 'No longer available' shows the prompt with the link to the agreement (FR-6)", () => {
    renderForm();
    choose(f.form.outcome, f.outcomes.NOT_AVAILABLE);

    const link = screen.queryByRole("link", { name: f.goToAgreement });
    expect([link?.getAttribute("href"), link?.closest("p")?.textContent?.includes(f.prompt)]).toEqual([AGREEMENT_HREF, true]);
  });

  it("freshnessRecordForm_answers_sentencesByCode: each refusal shows its one sentence; the page is asked to read the listing again only after a 201, a 409 CONCURRENT_MODIFICATION and a 404", async () => {
    const answers = [
      refused(400, "VALIDATION_FAILED"),
      refused(404, "NOT_FOUND"),
      refused(409, "LISTING_ARCHIVED"),
      refused(409, "CONCURRENT_MODIFICATION"),
      refused(500, "INTERNAL_ERROR"),
      RECORDED,
    ];
    const sentences: (string | null)[] = [];
    const spies: Spies[] = [];
    let keptAfterConcurrent: (boolean | undefined)[] = [];
    for (const [index, answer] of answers.entries()) {
      vi.mocked(recordListingFreshness).mockResolvedValueOnce(answer);
      const view = renderForm();
      spies.push(view.spies);
      complete();
      fireEvent.click(saveButton() as HTMLButtonElement);
      await settle();
      sentences.push(screen.queryByRole("alert")?.textContent ?? null);
      if (index === 3) keptAfterConcurrent = [radioChecked(f.form.channel, f.channels.CALL), radioChecked(f.form.outcome, f.outcomes.AVAILABLE)];
      view.unmount();
    }

    expect(sentences.slice(0, 5)).toEqual([f.answers.invalid, f.answers.notFound, f.answers.archived, f.answers.concurrent, f.answers.failed]);
    expect(keptAfterConcurrent).toEqual([true, true]);
    expect(spies[5]?.onDone).toHaveBeenCalledTimes(1);
    expect(spies.map((spy) => spy.onListingChanged.mock.calls)).toEqual([[], [["gone"]], [], [["concurrent"]], [], [["recorded"]]]);
  });

  it("freshnessRecordForm_saveDisabledWhileListingRereads: 'Save contact' waits while the page's listing re-read runs", () => {
    const view = renderForm({ listingRereading: true });
    complete();
    expect(saveButton()?.disabled).toBe(true);
    view.rerenderWith(false);
    expect(saveButton()?.disabled).toBe(false);
  });

  it("freshnessRecordForm_doubleClick_oneRequest: two submits before the answer send one request", async () => {
    let answer: (result: ApiResult<ListingFreshnessRecorded>) => void = () => undefined;
    vi.mocked(recordListingFreshness).mockReturnValueOnce(new Promise((done) => (answer = done)));
    renderForm();
    complete();
    act(() => {
      fireEvent.submit(form());
      fireEvent.submit(form());
    });
    await settle();
    expect(recordListingFreshness).toHaveBeenCalledTimes(1);
    // The held answer is let go, so no action of this test stays pending into the next (React entangles them).
    answer(RECORDED);
    await settle();
  });

  it("freshnessRecordForm_noteCount_codePointsShown: the note's counter counts code points of the NFC text", () => {
    renderForm();
    fireEvent.change(screen.getByRole("textbox", { name: f.form.note }), { target: { value: "é😀" } });

    expect(screen.queryByText("2 / 500")).not.toBeNull();
  });

  it("freshnessRecordForm_submitIncomplete_actionChecksSendsNothing: a form submitted with no choice shows its field errors and sends nothing", async () => {
    renderForm();
    fireEvent.submit(form());
    await settle();

    expect([
      within(group(f.form.channel)).queryByText(f.form.errors.channel) !== null,
      within(group(f.form.outcome)).queryByText(f.form.errors.outcome) !== null,
    ]).toEqual([true, true]);
    expect(recordListingFreshness).not.toHaveBeenCalled();
  });

  it("freshnessRecordForm_noteOverEdge_fieldErrorOnBlur: a note above 2,000 UTF-16 units shows its error on leaving it and holds 'Save contact'", () => {
    renderForm();
    complete();
    const note = screen.getByRole("textbox", { name: f.form.note });
    fireEvent.change(note, { target: { value: "a".repeat(2001) } });
    fireEvent.blur(note);

    const description = note.getAttribute("aria-describedby");
    expect(description === null ? null : document.getElementById(description)?.textContent).toBe(f.form.errors.noteTooLong);
    expect(note.getAttribute("aria-invalid")).toBe("true");
    expect(saveButton()?.disabled).toBe(true);
  });
});
