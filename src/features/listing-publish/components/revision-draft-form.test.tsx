import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import { formValues, type RevisionFormValues } from "../lib/revision-form";
import { revisionPanelModel, type RevisionScreen } from "../lib/revision-model";
import type { ListingFeatures, ListingRevisionChange, ListingRevisionDetail } from "../types";

// The edge only: the save, the submission and the sources read, so no request leaves the test.
vi.mock("../services/revision-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/revision-api")>()),
  saveListingRevisionContent: vi.fn(),
  submitListingRevision: vi.fn(),
  captureListingRevisionTerms: vi.fn(),
  getListingTermsSources: vi.fn(),
}));

import { getListingTermsSources, saveListingRevisionContent, submitListingRevision } from "../services/revision-api";

import { RevisionDraftForm } from "./revision-draft-form";
import { useRevisionCommand } from "./use-revision-command";

const r = en.ListingPublish.revision;
const LISTING_ID = "01JG000000000000000000000L";

const NOTHING_CHOSEN: ListingFeatures = {
  furnishing: null,
  airConditioner: false,
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
};

/** An empty Draft, as a start answers it. */
const EMPTY: ListingRevisionDetail = {
  listingId: LISTING_ID,
  revisionNo: 1,
  status: "DRAFT",
  createdAt: "2026-11-20T03:15:00Z",
  updatedAt: "2026-11-20T03:15:00Z",
  title: null,
  description: null,
  features: NOTHING_CHOSEN,
  termsSnapshot: null,
  unitSnapshot: null,
  submittedAt: null,
  dataVersion: 4,
  problems: [
    { part: "TITLE", rule: "REQUIRED" },
    { part: "DESCRIPTION", rule: "REQUIRED" },
    { part: "TERMS", rule: "REQUIRED" },
  ],
};

const CHANGE: ApiResult<ListingRevisionChange> = {
  ok: true,
  status: 200,
  replayed: false,
  data: { listingId: LISTING_ID, revisionNo: 1, status: "DRAFT", dataVersion: 5 },
};

function screenOf(detail: ListingRevisionDetail): RevisionScreen {
  const model = revisionPanelModel({ ok: true, status: 200, replayed: false, data: detail }, { openRevisionNo: 1, dataVersion: 4, viewerMayDraft: true });
  if (model.kind !== "ready") throw new Error("expected a ready model");
  return model.screen;
}

/** The form with the panel's runner, as the panel gives it. */
function Harness({ detail, values, valuesToken, reread }: { detail: ListingRevisionDetail; values: RevisionFormValues; valuesToken: number; reread: () => void }) {
  const { busy, run } = useRevisionCommand();
  return (
    <RevisionDraftForm
      listingId={LISTING_ID}
      screen={screenOf(detail)}
      values={values}
      valuesToken={valuesToken}
      busy={busy}
      run={run}
      reread={reread}
    />
  );
}

function renderForm(detail: ListingRevisionDetail = EMPTY, reread = vi.fn<() => void>()) {
  const element = (d: ListingRevisionDetail, token: number) => (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <Harness detail={d} values={formValues(d)} valuesToken={token} reread={reread} />
    </NextIntlClientProvider>
  );
  const view = render(element(detail, 0));
  return { ...view, reread, rerenderWith: (d: ListingRevisionDetail, token: number) => view.rerender(element(d, token)) };
}

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const titleBox = () => screen.getByRole("textbox", { name: r.title }) as HTMLInputElement;
const descriptionBox = () => screen.getByRole("textbox", { name: r.description }) as HTMLTextAreaElement;

describe("RevisionDraftForm (listing-publish US-2 AC-1 to AC-4, spec section 6, RD-13)", () => {
  beforeEach(() => {
    vi.mocked(saveListingRevisionContent).mockReset();
    vi.mocked(submitListingRevision).mockReset();
    vi.mocked(getListingTermsSources).mockReset();
    vi.mocked(getListingTermsSources).mockReturnValue(new Promise(() => undefined));
  });

  it("revisionDraftForm_typing_countersInCodePoints: the counters show code points of the NFC text, an emoji and an NFD letter one each, and block nothing", () => {
    renderForm();

    expect(screen.getByText("0 / 90")).toBeTruthy();
    expect(screen.getByText("0 / 3,000")).toBeTruthy();
    fireEvent.change(titleBox(), { target: { value: "Phòng 😀" } });
    expect(screen.getByText("7 / 90")).toBeTruthy();
    fireEvent.change(descriptionBox(), { target: { value: "Phòng\nrộng" } });
    expect(screen.getByText("10 / 3,000")).toBeTruthy();
    fireEvent.change(titleBox(), { target: { value: "x".repeat(95) } });
    expect(screen.getByText("95 / 90")).toBeTruthy();
    expect((screen.getByRole("button", { name: r.saveDraft }) as HTMLButtonElement).disabled).toBe(false);
    // The counter is the field's description, read with it.
    expect(titleBox().getAttribute("aria-describedby")).toBe(screen.getByText("95 / 90").id);
  });

  it("revisionDraftForm_doubleClickSave_onePut: two clicks send one save; the button reads Saving… disabled until the answer; the panel reads again once", async () => {
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(saveListingRevisionContent).mockReturnValueOnce(answer.promise);
    const { reread } = renderForm();
    fireEvent.change(titleBox(), { target: { value: "Phòng trọ gần trường" } });

    fireEvent.click(screen.getByRole("button", { name: r.saveDraft }));
    const saving = screen.getByRole("button", { name: r.saving }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    fireEvent.click(saving);
    fireEvent.submit(titleBox().form as HTMLFormElement);
    expect(saveListingRevisionContent).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: r.submit }) as HTMLButtonElement).disabled).toBe(true);

    answer.resolve(CHANGE);
    expect(await screen.findByRole("button", { name: r.saveDraft })).toBeTruthy();
    expect(saveListingRevisionContent).toHaveBeenCalledTimes(1);
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it("revisionDraftForm_doubleClickSubmit_onePost: two clicks send one submission; the button reads Submitting… disabled until the answer", async () => {
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(submitListingRevision).mockReturnValueOnce(answer.promise);
    renderForm({ ...EMPTY, title: "Phòng trọ gần trường đại học", dataVersion: 7 });

    fireEvent.click(screen.getByRole("button", { name: r.submit }));
    const submitting = screen.getByRole("button", { name: r.submitting }) as HTMLButtonElement;
    expect(submitting.disabled).toBe(true);
    fireEvent.click(submitting);
    expect(submitListingRevision).toHaveBeenCalledTimes(1);
    expect(submitListingRevision).toHaveBeenCalledWith(LISTING_ID, 1, 7);
    expect((screen.getByRole("button", { name: r.saveDraft }) as HTMLButtonElement).disabled).toBe(true);

    answer.resolve({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 1, status: "PENDING_REVIEW", dataVersion: 8 } });
    expect(await screen.findByRole("button", { name: r.submit })).toBeTruthy();
    expect(submitListingRevision).toHaveBeenCalledTimes(1);
  });

  it("revisionDraftForm_partialSave_bodyWithNulls: a title only is saved with the description null and every feature as chosen, 'Not stated' as null", async () => {
    vi.mocked(saveListingRevisionContent).mockResolvedValueOnce(CHANGE);
    renderForm();

    fireEvent.change(titleBox(), { target: { value: "Phòng trọ gần trường" } });
    fireEvent.click(screen.getByRole("checkbox", { name: r.features.labels.internet }));
    fireEvent.click(screen.getByRole("button", { name: r.saveDraft }));

    await waitFor(() => expect(saveListingRevisionContent).toHaveBeenCalledTimes(1));
    expect(saveListingRevisionContent).toHaveBeenCalledWith(LISTING_ID, 1, {
      dataVersion: 4,
      title: "Phòng trọ gần trường",
      description: null,
      features: { ...NOTHING_CHOSEN, internet: true },
    });
  });

  it("revisionDraftForm_unsavedChanges_submitWaitsForSave: with unsaved changes Submit waits for a save; a new read after it shows the stored values", () => {
    const { rerenderWith } = renderForm({ ...EMPTY, title: "Phòng trọ gần trường đại học" });
    const submit = () => screen.getByRole("button", { name: r.submit }) as HTMLButtonElement;
    expect(submit().disabled).toBe(false);
    expect(screen.queryByText(r.unsaved)).toBeNull();

    fireEvent.change(descriptionBox(), { target: { value: "Phòng rộng  " } });
    expect(submit().disabled).toBe(true);
    expect(screen.getByText(r.unsaved)).toBeTruthy();

    // The same read again (another command's answer) keeps what is typed.
    rerenderWith({ ...EMPTY, title: "Phòng trọ gần trường đại học" }, 0);
    expect(descriptionBox().value).toBe("Phòng rộng  ");

    // The read after a save: the stored, normalized values replace the typed ones.
    rerenderWith({ ...EMPTY, title: "Phòng trọ gần trường đại học", description: "Phòng rộng" }, 1);
    expect(descriptionBox().value).toBe("Phòng rộng");
    expect(submit().disabled).toBe(false);
    expect(screen.queryByText(r.unsaved)).toBeNull();
  });
});
