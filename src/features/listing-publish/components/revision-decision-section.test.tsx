import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { RevisionDecisionInput } from "../lib/revision-decision-model";
import type { ListingRevisionChange, ListingRevisionDecision } from "../types";

// The edge only: the decision read and the copy, so no request leaves the test.
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  getListingRevisionDecision: vi.fn(),
  copyListingRevision: vi.fn(),
}));

import { copyListingRevision, getListingRevisionDecision } from "../services/review-api";

import { RevisionDecisionSection } from "./revision-decision-section";

const s = en.ListingPublish.decision;
const v = en.ListingPublish.review;
const LISTING_ID = "01JG000000000000000000000L";

const RETURNED: ListingRevisionDecision = {
  outcome: "NEEDS_CHANGES",
  decidedAt: "2026-11-22T03:00:00Z",
  checklistVersion: null,
  changeReasons: ["MISSING_INFORMATION", "OTHER"],
  rejectionGroup: null,
  note: "Thiếu diện tích.\nThêm ảnh phòng tắm.",
};
const REJECTED: ListingRevisionDecision = { ...RETURNED, outcome: "REJECTED", changeReasons: [], rejectionGroup: "WRONG_UNIT", note: "Sai căn." };

const INPUT: RevisionDecisionInput = { revisionNo: 2, status: "NEEDS_CHANGES", dataVersion: 7, openRevisionNo: null, viewerIsAssignedSale: true };

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<never> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderSection(input: RevisionDecisionInput = INPUT) {
  const onListingChanged = vi.fn<() => void>();
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <RevisionDecisionSection listingId={LISTING_ID} input={input} onListingChanged={onListingChanged} />
    </NextIntlClientProvider>,
  );
  return { ...view, onListingChanged };
}

const region = () => screen.getByRole("region", { name: s.heading });

describe("RevisionDecisionSection (listing-publish US-4 AC-6, US-2 AC-6, spec section 6, E06S4-D14, D15, D17)", () => {
  beforeEach(() => {
    vi.mocked(getListingRevisionDecision).mockReset();
    vi.mocked(copyListingRevision).mockReset();
  });

  it("revisionDecisionSection_needsChanges_reasonsNoteAndCopy: the returned revision's number, outcome, time, reasons and note, and 'Copy into a new draft' for its assigned Sale", async () => {
    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce(ok(RETURNED));
    renderSection();

    expect(within(region()).getByRole("heading", { level: 2, name: s.heading })).toBeTruthy();
    expect(await within(region()).findByText("Revision 2: Needs changes")).toBeTruthy();
    expect(getListingRevisionDecision).toHaveBeenCalledWith(LISTING_ID, 2);
    expect(within(region()).getByText(/^Decided Nov 22, 2026, 10:00\sAM$/)).toBeTruthy();
    expect(within(region()).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      v.changeReasons.MISSING_INFORMATION,
      v.changeReasons.OTHER,
    ]);
    expect(within(region()).getByText((_, element) => element?.textContent === RETURNED.note && element.tagName === "P")).toBeTruthy();
    expect(within(region()).getByRole("button", { name: s.copy })).toBeTruthy();
    expect(within(region()).queryByText(s.rejected)).toBeNull();
  });

  it("revisionDecisionSection_openDraft_decisionKeptNoButton: while a revision is open, or for anyone but the assigned Sale, the decision stays in sight without the copy button", async () => {
    vi.mocked(getListingRevisionDecision).mockResolvedValue(ok(RETURNED));
    const view = renderSection({ ...INPUT, openRevisionNo: 3 });
    expect(await within(region()).findByText("Revision 2: Needs changes")).toBeTruthy();
    expect(within(region()).getByText(v.changeReasons.MISSING_INFORMATION)).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
    view.unmount();

    renderSection({ ...INPUT, viewerIsAssignedSale: false });
    expect(await within(region()).findByText("Revision 2: Needs changes")).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
  });

  it("revisionDecisionSection_rejected_sentenceNoButton: a rejection shows its group, its note and why it cannot be copied, with no copy button", async () => {
    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce(ok(REJECTED));
    renderSection({ ...INPUT, status: "REJECTED" });

    expect(await within(region()).findByText("Revision 2: Rejected")).toBeTruthy();
    expect(within(region()).getByText(`${s.groupLine.replace("{group}", v.rejectionGroups.WRONG_UNIT)}`)).toBeTruthy();
    expect(within(region()).getByText("Sai căn.")).toBeTruthy();
    expect(within(region()).getByText(s.rejected)).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
  });

  it("revisionDecisionSection_copy_onceThenListingReread: the copy is sent once with the listing's data version, held while it runs; its answer asks the page to read the listing again", async () => {
    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce(ok(RETURNED));
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(copyListingRevision).mockReturnValueOnce(answer.promise);
    const { onListingChanged } = renderSection();

    fireEvent.click(await within(region()).findByRole("button", { name: s.copy }));
    const copying = within(region()).getByRole("button", { name: s.copying }) as HTMLButtonElement;
    expect(copying.disabled).toBe(true);
    fireEvent.click(copying);
    expect(copyListingRevision).toHaveBeenCalledTimes(1);
    expect(copyListingRevision).toHaveBeenCalledWith(LISTING_ID, 2, 7);

    answer.resolve({ ok: true, status: 201, replayed: false, data: { listingId: LISTING_ID, revisionNo: 3, status: "DRAFT", dataVersion: 8 } });
    await waitFor(() => expect(onListingChanged).toHaveBeenCalledTimes(1));
    // The decision stays; the button waits for the listing's answer, which brings the open Draft.
    expect(within(region()).getByText("Revision 2: Needs changes")).toBeTruthy();
    expect(within(region()).queryByRole("button", { name: s.copy })).toBeNull();
    expect(getListingRevisionDecision).toHaveBeenCalledTimes(1);

    // A refusal shows its sentence and also asks for the listing.
    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce(ok(RETURNED));
    vi.mocked(copyListingRevision).mockResolvedValueOnce(http(409, "OPEN_REVISION_EXISTS"));
    const second = renderSection();
    fireEvent.click(await within(screen.getAllByRole("region", { name: s.heading })[1] as HTMLElement).findByRole("button", { name: s.copy }));
    expect((await within(screen.getAllByRole("region", { name: s.heading })[1] as HTMLElement).findByRole("alert")).textContent).toBe(s.answers.openExists);
    expect(second.onListingChanged).toHaveBeenCalledTimes(1);
  });

  it("revisionDecisionSection_states_loadingErrorNothingFor404: loading, an error with Try again reading again, and nothing at all for the one 404", async () => {
    const first = deferred<ApiResult<ListingRevisionDecision>>();
    vi.mocked(getListingRevisionDecision).mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(RETURNED));
    const view = renderSection();

    expect(within(region()).getByRole("status").textContent).toBe(s.loading);
    first.resolve(http(500, "INTERNAL_ERROR"));
    expect(await within(region()).findByText(s.loadFailed)).toBeTruthy();
    fireEvent.click(within(region()).getByRole("button", { name: s.retry }));
    expect(await within(region()).findByText("Revision 2: Needs changes")).toBeTruthy();
    expect(getListingRevisionDecision).toHaveBeenCalledTimes(2);
    view.unmount();

    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce(http(404, "NOT_FOUND"));
    const { container } = renderSection();
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(screen.queryByRole("region", { name: s.heading })).toBeNull();
  });

  it("revisionDecisionSection_note_textOnly: the reviewer's note is shown as text, with no element or link of its own", async () => {
    const note = '<b>Rẻ</b> <a href="https://example.com">xem</a> <img src=x onerror=alert(1)>';
    vi.mocked(getListingRevisionDecision).mockResolvedValueOnce(ok({ ...RETURNED, note }));
    renderSection({ ...INPUT, viewerIsAssignedSale: false });

    expect(await within(region()).findByText(note)).toBeTruthy();
    expect(region().querySelector("b, a, img")).toBeNull();
  });
});
