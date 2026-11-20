import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { AgreementListings, ListingCreated, ListingItem } from "../types";

// The edge only: the two listing calls and the router, so no request leaves the test.
vi.mock("../services/listing-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/listing-api")>()),
  getAgreementListings: vi.fn(),
  createListing: vi.fn(),
}));

const push = vi.fn<(path: string) => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { createListing, getAgreementListings } from "../services/listing-api";

import { AgreementListingSection } from "./agreement-listing-section";

const s = en.ListingPublish.section;
const c = en.ListingPublish.create;
const r = en.ListingPublish.reasons;
const AGREEMENT_ID = "01JF000000000000000000000A";
const NEW_LISTING_ID = "01JG00000000000000000000L9";

const item = (listingId: string, code: string, state: ListingItem["state"]): ListingItem => ({
  listingId,
  code,
  state,
  createdAt: "2026-11-20T03:15:00Z",
});
const OPEN = item("01JG00000000000000000000L3", "TD-7K3M-Q9TX", "UNPUBLISHED");
const ARCHIVED = item("01JG00000000000000000000L1", "TD-2345-6789", "ARCHIVED");

function answered(
  listings: ListingItem[],
  creation: Partial<AgreementListings["creation"]> = {},
  hasOlder = false,
): ApiResult<AgreementListings> {
  return {
    ok: true,
    status: 200,
    replayed: false,
    data: {
      agreementId: AGREEMENT_ID,
      listings,
      hasOlder,
      creation: { viewerMayCreate: false, advertisingNotStarted: false, reasonGroups: [], ...creation },
    },
  };
}

const failed = <T,>(status: number, code: string): ApiResult<T> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementListingSection agreementId={AGREEMENT_ID} />
    </NextIntlClientProvider>,
  );
}

const region = () => screen.findByRole("region", { name: s.title });

describe("AgreementListingSection (listing-publish E06-S1, spec section 6, UL-1, UL-2)", () => {
  beforeEach(() => {
    vi.mocked(getAgreementListings).mockReset();
    vi.mocked(createListing).mockReset();
    push.mockReset();
  });

  it("agreementListingSection_states_render: loading, then each answer of spec section 6 with its lines", async () => {
    const first = deferred<ApiResult<AgreementListings>>();
    vi.mocked(getAgreementListings).mockReturnValueOnce(first.promise);
    let view = renderSection();

    // Loading, then an open listing with an archived one and the older line: no create action.
    expect(within(await region()).getByText(s.loading)).toBeTruthy();
    first.resolve(answered([OPEN, ARCHIVED], { viewerMayCreate: false }, true));
    let section = await region();
    const [open, archived] = await within(section).findAllByRole("listitem");
    expect(within(open as HTMLElement).getByText("Listing TD-7K3M-Q9TX")).toBeTruthy();
    expect(within(open as HTMLElement).getByText("Unpublished")).toBeTruthy();
    expect(within(open as HTMLElement).getByRole("link", { name: s.open }).getAttribute("href")).toBe(
      `/workspace/listings/${OPEN.listingId}`,
    );
    expect(within(archived as HTMLElement).getByText("Listing TD-2345-6789")).toBeTruthy();
    expect(within(archived as HTMLElement).getByText("Archived")).toBeTruthy();
    expect(within(archived as HTMLElement).getByRole("link", { name: s.open }).getAttribute("href")).toBe(
      `/workspace/listings/${ARCHIVED.listingId}`,
    );
    expect(within(section).getByText(s.older)).toBeTruthy();
    expect(within(section).queryByRole("button", { name: s.create })).toBeNull();
    for (const line of [s.noListing, s.noOpenListing, s.notAllowed, s.assignedSaleOnly, s.loading]) {
      expect(within(section).queryByText(line)).toBeNull();
    }
    view.unmount();

    // No listing at all, the caller may create: the empty line and the button, with and without the not-started line.
    for (const advertisingNotStarted of [false, true]) {
      vi.mocked(getAgreementListings).mockResolvedValueOnce(answered([], { viewerMayCreate: true, advertisingNotStarted }));
      view = renderSection();
      section = await region();
      expect(await within(section).findByRole("button", { name: s.create })).toBeTruthy();
      expect(within(section).getByText(s.noListing)).toBeTruthy();
      expect(within(section).queryByText(s.notStarted) !== null).toBe(advertisingNotStarted);
      expect(within(section).queryByRole("listitem")).toBeNull();
      expect(within(section).queryByText(s.older)).toBeNull();
      view.unmount();
    }

    // Archived only, refused: the no-open line, the refusal heading and one line per group, the archived listing.
    vi.mocked(getAgreementListings).mockResolvedValueOnce(
      answered([ARCHIVED], { viewerMayCreate: false, reasonGroups: ["SUSPENDED", "OWNER"] }),
    );
    view = renderSection();
    section = await region();
    expect(await within(section).findByText(s.noOpenListing)).toBeTruthy();
    expect(within(section).getByText(s.notAllowed)).toBeTruthy();
    expect(within(section).getByText(r.SUSPENDED)).toBeTruthy();
    expect(within(section).getByText(r.OWNER)).toBeTruthy();
    expect(within(section).getByText(s.notAllowed).compareDocumentPosition(within(section).getByText(r.SUSPENDED)) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getByText(r.SUSPENDED).compareDocumentPosition(within(section).getByText(r.OWNER)) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(within(section).getByRole("listitem")).getByText("Listing TD-2345-6789")).toBeTruthy();
    expect(within(section).queryByRole("button", { name: s.create })).toBeNull();
    expect(within(section).queryByText(s.assignedSaleOnly)).toBeNull();
    view.unmount();

    // Not the assignee: the empty line and the assigned-Sale line only.
    vi.mocked(getAgreementListings).mockResolvedValueOnce(answered([], { viewerMayCreate: false, reasonGroups: [] }));
    view = renderSection();
    section = await region();
    expect(await within(section).findByText(s.assignedSaleOnly)).toBeTruthy();
    expect(within(section).getByText(s.noListing)).toBeTruthy();
    expect(within(section).queryByText(s.notAllowed)).toBeNull();
    expect(within(section).queryByRole("button", { name: s.create })).toBeNull();
    expect(getAgreementListings).toHaveBeenCalledTimes(5);
    expect(vi.mocked(getAgreementListings).mock.calls.every(([id]) => id === AGREEMENT_ID)).toBe(true);
    expect(createListing).not.toHaveBeenCalled();
  });

  it("agreementListingSection_notFound_rendersNothing: a 404 and the session answers render no region", async () => {
    for (const answer of [
      failed<AgreementListings>(404, "NOT_FOUND"),
      { ok: false, kind: "signed-out" } as const,
      { ok: false, kind: "unavailable" } as const,
    ]) {
      vi.mocked(getAgreementListings).mockResolvedValueOnce(answer);
      const { container, unmount } = renderSection();

      await waitFor(() => expect(screen.queryByRole("region", { name: s.title })).toBeNull());
      expect(container.textContent).toBe("");
      unmount();
    }
    expect(getAgreementListings).toHaveBeenCalledTimes(3);
  });

  it("agreementListingSection_failure_retryReadsAgain: a failed read says so, and Try again reads again", async () => {
    vi.mocked(getAgreementListings)
      .mockResolvedValueOnce(failed(500, "INTERNAL_ERROR"))
      .mockResolvedValueOnce(answered([OPEN]));
    renderSection();

    const section = await region();
    expect(await within(section).findByText(s.loadFailed)).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: s.retry }));

    expect(await within(section).findByText("Listing TD-7K3M-Q9TX")).toBeTruthy();
    expect(within(section).queryByText(s.loadFailed)).toBeNull();
    expect(getAgreementListings).toHaveBeenCalledTimes(2);
  });

  it("agreementListingSection_doubleClick_onePost: two clicks send one create; the button reads Creating… disabled; a 201 goes to the listing", async () => {
    vi.mocked(getAgreementListings).mockResolvedValueOnce(answered([], { viewerMayCreate: true }));
    const answer = deferred<ApiResult<ListingCreated>>();
    vi.mocked(createListing).mockReturnValueOnce(answer.promise);
    renderSection();

    const button = await within(await region()).findByRole("button", { name: s.create });
    fireEvent.click(button);
    fireEvent.click(button);

    const creating = await screen.findByRole("button", { name: s.creating });
    expect((creating as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(creating);
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createListing).mock.calls[0]?.[0]).toBe(AGREEMENT_ID);

    answer.resolve({ ok: true, status: 201, replayed: false, data: { listingId: NEW_LISTING_ID, code: "TD-7K3M-Q9TX" } });

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/workspace/listings/${NEW_LISTING_ID}`));
    expect(push).toHaveBeenCalledTimes(1);
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(getAgreementListings).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: s.creating }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("agreementListingSection_refused_sentenceKeptAfterReread: a refusal shows its sentence, focused, reads again and keeps it above the new content; after a 404 reread, the heading and the sentence only", async () => {
    const reread = deferred<ApiResult<AgreementListings>>();
    vi.mocked(getAgreementListings)
      .mockResolvedValueOnce(answered([], { viewerMayCreate: true }))
      .mockReturnValueOnce(reread.promise);
    vi.mocked(createListing).mockResolvedValueOnce(failed(409, "LISTING_NOT_ALLOWED"));
    const view = renderSection();

    fireEvent.click(await within(await region()).findByRole("button", { name: s.create }));

    const sentence = await screen.findByText(c.notAllowed);
    await waitFor(() => expect(document.activeElement).toBe(sentence));
    expect(getAgreementListings).toHaveBeenCalledTimes(2);
    reread.resolve(answered([], { viewerMayCreate: false, reasonGroups: ["ENDED"] }));

    const section = await region();
    const ended = await within(section).findByText(r.ENDED);
    expect(within(section).getByText(c.notAllowed)).toBe(sentence);
    expect(sentence.compareDocumentPosition(within(section).getByText(s.noListing)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sentence.compareDocumentPosition(ended) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).queryByRole("button", { name: s.create })).toBeNull();
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    view.unmount();

    // The reread answers 404: the region keeps its heading and the sentence, nothing else.
    vi.mocked(getAgreementListings)
      .mockResolvedValueOnce(answered([], { viewerMayCreate: true }))
      .mockResolvedValueOnce(failed(404, "NOT_FOUND"));
    vi.mocked(createListing).mockResolvedValueOnce(failed(404, "NOT_FOUND"));
    renderSection();

    fireEvent.click(await within(await region()).findByRole("button", { name: s.create }));

    const kept = await screen.findByText(c.notFound);
    await waitFor(() => expect(getAgreementListings).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.queryByText(s.loading)).toBeNull());
    const alone = await region();
    expect(within(alone).getByRole("heading", { level: 2, name: s.title })).toBeTruthy();
    expect(alone.textContent).toBe(`${s.title}${c.notFound}`);
    expect(within(alone).getByText(c.notFound)).toBe(kept);
  });
});
