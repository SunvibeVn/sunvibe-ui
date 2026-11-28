import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingPublication, ListingRevisionChange } from "../types";

// The edges only: the publication read, the put live and the copy, so no request leaves the test.
vi.mock("../services/publication-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/publication-api")>()),
  getListingPublication: vi.fn(),
  putListingRevisionLive: vi.fn(),
}));
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  copyListingRevision: vi.fn(),
}));

import { getListingPublication, putListingRevisionLive } from "../services/publication-api";
import { copyListingRevision } from "../services/review-api";

import { PublicationSection } from "./publication-section";

const p = en.ListingPublish.publication;
const d = en.ListingPublish.decision;
const LISTING_ID = "01JG000000000000000000000L";

/** Revision 2 live since 10:00 Vietnam time, revision 3 approved and waiting for a freshness confirmation. */
const PUBLICATION: ListingPublication = {
  listingId: LISTING_ID,
  state: "PUBLISHED",
  dataVersion: 9,
  live: { revisionNo: 2, wentLiveAt: "2026-11-22T03:00:00Z", display: { holds: true, reasons: [], reasonGroups: [] } },
  approved: { revisionNo: 3, termsSource: "IN_EFFECT", display: { holds: false, reasons: ["FRESHNESS"], reasonGroups: [] } },
  viewerMayPutLive: true,
  viewerMayCopy: false,
};
/** Nothing live yet: revision 3 waits. */
const WAITING: ListingPublication = { ...PUBLICATION, state: "UNPUBLISHED", live: null };

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string, fields: string[] = []): ApiResult<never> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "This reason stops the put live." })),
});
const LIVE: ApiResult<ListingRevisionChange> = ok({ listingId: LISTING_ID, revisionNo: 3, status: "LIVE", dataVersion: 10 });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function element(refresh: number, onListingChanged: () => void) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <PublicationSection listingId={LISTING_ID} refresh={refresh} onListingChanged={onListingChanged} />
    </NextIntlClientProvider>
  );
}

function renderSection(refresh = 0) {
  const onListingChanged = vi.fn<() => void>();
  const view = render(element(refresh, onListingChanged));
  return { ...view, onListingChanged, rerenderWith: (next: number) => view.rerender(element(next, onListingChanged)) };
}

const region = () => screen.getByRole("region", { name: p.title });
const putLiveButton = () => within(region()).queryByRole("button", { name: p.putLive }) as HTMLButtonElement | null;
/** Lets every answer already given reach the screen. */
const settle = () => act(async () => new Promise<void>((done) => setTimeout(done, 0)));

describe("PublicationSection (listing-publish US-2 AC-7, US-5 AC-1, AC-3, spec section 6, E06S6-D11, D14)", () => {
  beforeEach(() => {
    for (const call of [getListingPublication, putListingRevisionLive, copyListingRevision]) vi.mocked(call).mockReset();
  });

  it("publicationSection_states_loadingErrorRetryReady: its own heading, loading, the error with Try again reading again, then the live and the waiting revision with their display lines; nothing for a session answer or the one 404", async () => {
    const first = deferred<ApiResult<ListingPublication>>();
    vi.mocked(getListingPublication).mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(PUBLICATION));
    const view = renderSection();

    expect(within(region()).getByRole("heading", { level: 2, name: p.title })).toBeTruthy();
    expect(within(region()).getByRole("status").textContent).toBe(p.loading);
    first.resolve(http(500, "INTERNAL_ERROR"));
    expect(await within(region()).findByText(p.loadError)).toBeTruthy();
    fireEvent.click(within(region()).getByRole("button", { name: en.ListingPublish.page.retry }));
    expect(await within(region()).findByText(/^Revision 2 is live since Nov 22, 2026, 10:00\sAM\.$/)).toBeTruthy();
    expect(getListingPublication).toHaveBeenCalledTimes(2);
    expect(getListingPublication).toHaveBeenCalledWith(LISTING_ID);
    expect(within(region()).getByText(p.holds)).toBeTruthy();
    expect(within(region()).getByText("Revision 3 is approved and waits to go live.")).toBeTruthy();
    expect(within(region()).getByText(p.notHolds)).toBeTruthy();
    expect(within(region()).getAllByRole("listitem").map((item) => item.textContent)).toEqual([p.reasons.FRESHNESS]);
    expect(putLiveButton()?.disabled).toBe(false);
    expect(within(region()).queryByText(p.loadError)).toBeNull();
    view.unmount();

    // Nothing live and nothing waiting.
    vi.mocked(getListingPublication).mockResolvedValueOnce(ok({ ...WAITING, approved: null, viewerMayPutLive: false }));
    const empty = renderSection();
    expect(await within(region()).findByText(p.noLive)).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
    empty.unmount();

    for (const answer of [{ ok: false, kind: "signed-out" }, http(404, "NOT_FOUND")] as ApiResult<ListingPublication>[]) {
      vi.mocked(getListingPublication).mockResolvedValueOnce(answer);
      const { container, unmount } = renderSection();
      await waitFor(() => expect(container.textContent).toBe(""));
      unmount();
    }
  });

  it("publicationSection_approvedViewerMayNotPutLive_noPutLive: an approved revision waits, and the read says the viewer may not put it live: no 'Put live' (PB-24, SV-337 (3))", async () => {
    vi.mocked(getListingPublication).mockResolvedValueOnce(ok({ ...PUBLICATION, viewerMayPutLive: false }));
    renderSection();

    expect(await within(region()).findByText("Revision 3 is approved and waits to go live.")).toBeTruthy();
    expect(putLiveButton()).toBeNull();
  });

  it("publicationSection_putLive_sendsOnceDisabledWhileRunning: 'Put live' sends one request with the read's data version, is held while it runs, and the section reads again once on the page's re-read", async () => {
    vi.mocked(getListingPublication).mockResolvedValueOnce(ok(WAITING)).mockReturnValueOnce(new Promise(() => undefined));
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(putListingRevisionLive).mockReturnValueOnce(answer.promise);
    const { onListingChanged, rerenderWith } = renderSection();

    fireEvent.click(await within(region()).findByRole("button", { name: p.putLive }));
    expect(putLiveButton()?.disabled).toBe(true);
    fireEvent.click(putLiveButton() as HTMLButtonElement);
    fireEvent.click(putLiveButton() as HTMLButtonElement);
    expect(putListingRevisionLive).toHaveBeenCalledTimes(1);
    expect(vi.mocked(putListingRevisionLive).mock.calls[0]?.slice(0, 3)).toEqual([LISTING_ID, 3, 9]);

    await act(async () => answer.resolve(LIVE));
    expect(onListingChanged).toHaveBeenCalledTimes(1);
    rerenderWith(1);
    await settle();
    expect(getListingPublication).toHaveBeenCalledTimes(2);
    expect(putListingRevisionLive).toHaveBeenCalledTimes(1);
  });

  it("publicationSection_refused_reasonsFocusedAndReread: a 409 PUT_LIVE_REFUSED lists its reasons and E05's groups, takes the focus, and the section reads again without the page", async () => {
    vi.mocked(getListingPublication).mockResolvedValueOnce(ok(WAITING)).mockResolvedValueOnce(ok(WAITING));
    vi.mocked(putListingRevisionLive).mockResolvedValueOnce(
      http(409, "PUT_LIVE_REFUSED", ["reasons.ADVERTISING_RIGHT", "reasonGroups.SUSPENDED", "reasonGroups.OWNER", "reasons.FRESHNESS"]),
    );
    const { onListingChanged } = renderSection();

    fireEvent.click(await within(region()).findByRole("button", { name: p.putLive }));
    const alert = await within(region()).findByRole("alert");
    expect(within(alert).getByText("Revision 3 cannot go live now:")).toBeTruthy();
    expect(within(alert).getByText(p.reasons.ADVERTISING_RIGHT, { exact: false })).toBeTruthy();
    expect(within(alert).getAllByRole("listitem").map((item) => item.firstChild?.textContent)).toEqual([
      p.reasons.ADVERTISING_RIGHT,
      en.ListingPublish.reasons.SUSPENDED,
      en.ListingPublish.reasons.OWNER,
      p.reasons.FRESHNESS,
    ]);
    // The focus is on the refusal: the element that holds it, not the page.
    await waitFor(() => expect(document.activeElement !== document.body && document.activeElement?.contains(alert)).toBe(true));
    await waitFor(() => expect(getListingPublication).toHaveBeenCalledTimes(2));
    await settle();
    expect(onListingChanged).not.toHaveBeenCalled();
    // The section's own re-read keeps the refusal on screen.
    expect(within(region()).getByText("Revision 3 cannot go live now:")).toBeTruthy();
    expect(putLiveButton()?.disabled).toBe(false);
  });

  it("publicationSection_listingReread_readsAgainWithoutLoading: a re-read of the page reads the section again, keeping what it shows and holding 'Put live' until it answers; an answer of an earlier command goes", async () => {
    const reread = deferred<ApiResult<ListingPublication>>();
    vi.mocked(getListingPublication).mockResolvedValueOnce(ok(WAITING)).mockResolvedValueOnce(ok(WAITING)).mockReturnValueOnce(reread.promise);
    vi.mocked(putListingRevisionLive).mockResolvedValueOnce(http(409, "PUT_LIVE_REFUSED", ["reasons.FRESHNESS"]));
    const { rerenderWith } = renderSection();

    fireEvent.click(await within(region()).findByRole("button", { name: p.putLive }));
    expect(await within(region()).findByText("Revision 3 cannot go live now:")).toBeTruthy();
    await waitFor(() => expect(getListingPublication).toHaveBeenCalledTimes(2));
    await settle();

    // A record elsewhere on the page read the listing again: the section reads again in place.
    rerenderWith(1);
    await waitFor(() => expect(getListingPublication).toHaveBeenCalledTimes(3));
    expect(within(region()).queryByRole("status")).toBeNull();
    expect(within(region()).getByText("Revision 3 is approved and waits to go live.")).toBeTruthy();
    expect(putLiveButton()?.disabled).toBe(true);

    reread.resolve(ok({ ...PUBLICATION, approved: null, viewerMayPutLive: false, live: { ...(PUBLICATION.live as NonNullable<ListingPublication["live"]>), revisionNo: 3 } }));
    expect(await within(region()).findByText(/^Revision 3 is live since /)).toBeTruthy();
    expect(within(region()).getByText(p.holds)).toBeTruthy();
    expect(within(region()).queryByText("Revision 3 cannot go live now:")).toBeNull();
    expect(putLiveButton()).toBeNull();
  });

  it("publicationSection_archived_sentenceOnlyNoButton: a read that answers ARCHIVED shows its one sentence and no other line or button", async () => {
    vi.mocked(getListingPublication).mockResolvedValueOnce(
      ok({ ...PUBLICATION, state: "ARCHIVED", live: null, approved: null, viewerMayPutLive: false, viewerMayCopy: false }),
    );
    renderSection();

    expect(await within(region()).findByText(p.archived)).toBeTruthy();
    expect(within(region()).queryByRole("button")).toBeNull();
    expect(within(region()).queryByText(p.noLive)).toBeNull();
    expect(region().textContent).toBe(`${p.title}${p.archived}`);
  });

  it("publicationSection_copyBesideEachRevision_whenMayCopy: 'Copy into a new draft' beside the live and the waiting revision only when the read permits it, sent once with its revision and the read's data version, then the page reads again", async () => {
    vi.mocked(getListingPublication).mockResolvedValueOnce(ok(PUBLICATION));
    const first = renderSection();
    expect(await within(region()).findByText(/^Revision 2 is live since /)).toBeTruthy();
    expect(within(region()).queryByRole("button", { name: d.copy })).toBeNull();
    first.unmount();

    vi.mocked(getListingPublication).mockResolvedValueOnce(ok({ ...PUBLICATION, viewerMayCopy: true }));
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(copyListingRevision).mockReturnValueOnce(answer.promise).mockResolvedValueOnce(http(409, "OPEN_REVISION_EXISTS"));
    const { onListingChanged } = renderSection();
    await within(region()).findByText(/^Revision 2 is live since /);
    const copies = within(region()).getAllByRole("button", { name: d.copy });
    expect(copies).toHaveLength(2);
    expect(copies.map((button) => document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent)).toEqual([
      expect.stringMatching(/^Revision 2 is live since /),
      "Revision 3 is approved and waits to go live.",
    ]);

    fireEvent.click(copies[0] as HTMLElement);
    fireEvent.click(within(region()).getByRole("button", { name: d.copying }));
    expect(copyListingRevision).toHaveBeenCalledTimes(1);
    expect(vi.mocked(copyListingRevision).mock.calls[0]?.slice(0, 3)).toEqual([LISTING_ID, 2, 9]);
    await act(async () => answer.resolve({ ok: true, status: 201, replayed: false, data: { listingId: LISTING_ID, revisionNo: 4, status: "DRAFT", dataVersion: 10 } }));
    expect(onListingChanged).toHaveBeenCalledTimes(1);

    // A refusal shows its sentence; the page reads again as well.
    fireEvent.click(within(region()).getAllByRole("button", { name: d.copy })[1] as HTMLElement);
    expect((await within(region()).findByRole("alert")).textContent).toBe(d.answers.openExists);
    expect(vi.mocked(copyListingRevision).mock.calls[1]?.slice(0, 3)).toEqual([LISTING_ID, 3, 9]);
    expect(onListingChanged).toHaveBeenCalledTimes(2);
  });

  it("publicationSection_live200_callsListingChanged: a 200 says the revision is live and asks the page to read again; a stale version or a revision no longer approved says so and asks too; other answers only say so", async () => {
    vi.mocked(getListingPublication).mockResolvedValue(ok(WAITING));
    vi.mocked(putListingRevisionLive).mockResolvedValueOnce(LIVE);
    const live = renderSection();
    fireEvent.click(await within(region()).findByRole("button", { name: p.putLive }));
    expect(await within(region()).findByText("Revision 3 is live.")).toBeTruthy();
    expect(live.onListingChanged).toHaveBeenCalledTimes(1);
    live.unmount();

    const rows: [ApiResult<ListingRevisionChange>, string, number][] = [
      [http(409, "CONCURRENT_MODIFICATION"), d.answers.concurrent, 1],
      [http(409, "REVISION_NOT_APPROVED"), p.answers.notApproved, 1],
      [http(409, "LISTING_ARCHIVED"), p.answers.archived, 0],
      [http(403, "FORBIDDEN"), p.answers.forbidden, 0],
      [http(500, "INTERNAL_ERROR"), d.answers.failed, 0],
    ];
    for (const [result, sentence, rereads] of rows) {
      vi.mocked(putListingRevisionLive).mockResolvedValueOnce(result);
      const view = renderSection();
      fireEvent.click(await within(region()).findByRole("button", { name: p.putLive }));
      expect((await within(region()).findByRole("alert")).textContent).toBe(sentence);
      expect(view.onListingChanged).toHaveBeenCalledTimes(rereads);
      view.unmount();
    }
    vi.mocked(getListingPublication).mockReset();
  });
});
