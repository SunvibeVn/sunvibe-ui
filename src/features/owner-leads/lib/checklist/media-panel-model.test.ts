import { describe, expect, it } from "vitest";

import type { ChecklistView, MediaItem, MediaList } from "@/features/surveys";

import { A, B, emptyContent, P1, P2, viewOf } from "./fixtures.test-support";
import { withoutHeldDetails } from "./media-held-details";
import { mediaPanelModel, PANEL_ACTIONS, removalNeedsCorrection, uploadRowStatus, viewedCard } from "./media-panel-model";

/** A PARTS checklist with spaces P101 (P1) and P102 (P2), held by A and editable for A. */
function viewFor(overrides: Partial<ChecklistView> = {}): ChecklistView {
  const view = viewOf(emptyContent("PARTS"), 1, { media: { available: true, uploadEnabled: true, setVersion: 3 }, ...overrides });
  const identification = view.groups?.identification;
  return {
    ...view,
    groups: {
      ...view.groups,
      identification: {
        ...identification,
        content: {
          ...identification?.content,
          rentalScope: "PARTS",
          spaces: [
            { spaceId: P1, code: "P101", location: "Floor 1", description: null },
            { spaceId: P2, code: "P102", location: "Floor 1", description: null },
          ],
        },
      },
    },
  };
}

const item = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id,
  mediaNo: Number(id.slice(1)),
  status: "READY",
  statusReason: null,
  spaceId: null,
  spaceCodeAtUpload: null,
  category: "EXTERIOR_ACCESS",
  caption: "Front gate",
  captionHidden: false,
  uploadedByUserId: A,
  uploadedByName: "Anh Sale",
  createdAt: "2026-11-01T02:00:00Z",
  removed: null,
  held: null,
  contentAvailable: true,
  unavailableReason: null,
  ...overrides,
});

function listOf(items: MediaItem[], overrides: Partial<MediaList> = {}): MediaList {
  return {
    checklistId: "C1",
    setVersion: 3,
    uploadEnabled: true,
    intakePaused: false,
    servingEnabled: true,
    canHold: false,
    limits: { maxFileBytes: 20_971_520, maxSelected: 100, selectedCount: items.length, maxPending: 20, pendingCount: 0 },
    items,
    notAcceptedItems: [],
    removedItems: [],
    totals: { notAccepted: 0, removed: 0 },
    coverage: [
      { spaceId: null, category: "EXTERIOR_ACCESS", required: true, readyCount: 1, processingCount: 0, state: "COVERED", notRequiredReason: null },
      { spaceId: P1, category: "MAIN_SPACE", required: true, readyCount: 0, processingCount: 1, state: "PROCESSING", notRequiredReason: null },
      { spaceId: P1, category: "KITCHEN", required: false, readyCount: 0, processingCount: 0, state: "NOT_REQUIRED", notRequiredReason: "No kitchen" },
      { spaceId: P2, category: "MAIN_SPACE", required: true, readyCount: 0, processingCount: 0, state: "MISSING", notRequiredReason: null },
      { spaceId: null, category: "DETAIL", required: false, readyCount: 0, processingCount: 0, state: "OPTIONAL", notRequiredReason: null },
    ],
    ...overrides,
  };
}

const modelFor = (view: ChecklistView, list: MediaList, viewerUserId = A) => mediaPanelModel(view, list, viewerUserId);

describe("viewedCard (SM-FE-07, SM-29: the open viewer shows the photo as the list on screen says)", () => {
  const heldItem = (overrides: Partial<MediaItem> = {}) =>
    item("M1", {
      caption: "Front gate",
      held: { at: "2026-11-03T02:00:00Z", byName: "Ann Admin", byUserId: "U-ADMIN", reason: "SECURITY_INCIDENT" },
      ...overrides,
    });

  it("followsTheCurrentList_notTheCardItOpenedWith", () => {
    const opened = mediaPanelModel(viewFor(), listOf([item("M1", { caption: "Front gate" })]), A);
    expect(viewedCard(opened, "M1")?.caption).toBe("Front gate");
    const renamed = mediaPanelModel(viewFor(), listOf([item("M1", { caption: "Side gate" })]), A);
    expect(viewedCard(renamed, "M1")?.caption).toBe("Side gate");
  });

  it("anAdminKeepsTheViewerOfAHeldPhoto_untilCanHoldIsGone", () => {
    const admin = listOf([heldItem()], { canHold: true });
    expect(viewedCard(mediaPanelModel(viewFor(), admin, A), "M1")).toMatchObject({ caption: "Front gate", canRelease: true });
    expect(viewedCard(mediaPanelModel(viewFor(), withoutHeldDetails(admin), A), "M1")).toBeNull();
  });

  it("aPhotoHeldMeanwhile_closesTheViewerOfAViewerWithoutCanHold", () => {
    const held = listOf([heldItem({ caption: null, captionHidden: true, contentAvailable: false, unavailableReason: "HELD" })]);
    expect(viewedCard(mediaPanelModel(viewFor(), held, A), "M1")).toBeNull();
  });

  it("aPhotoGoneFromTheGrid_closesTheViewer", () => {
    expect(viewedCard(mediaPanelModel(viewFor(), listOf([]), A), "M1")).toBeNull();
  });
});

describe("SM-FE-11: the photos the list leaves out (newest 100 only, spec 7.2 totals)", () => {
  it("moreNotAcceptedAndMoreRemoved_comeFromTheTotals", () => {
    const view = viewFor();
    const shownNotAccepted = Array.from({ length: 3 }, (_, index) => item(`N${index}`, { status: "REJECTED", contentAvailable: false }));
    const shownRemoved = [item("R1", { removed: { at: "2026-11-03T03:00:00Z", byName: "Sam Sale", kind: "HOLDER" }, contentAvailable: false })];
    const model = mediaPanelModel(
      view,
      listOf([], { notAcceptedItems: shownNotAccepted, removedItems: shownRemoved, totals: { notAccepted: 8, removed: 1 } }),
      A,
    );
    expect(model.moreNotAccepted).toBe(5);
    expect(model.moreRemoved).toBe(0);
  });

  it("noTotals_nothingMore", () => {
    const model = mediaPanelModel(viewFor(), listOf([], { totals: undefined }), A);
    expect(model.moreNotAccepted).toBe(0);
    expect(model.moreRemoved).toBe(0);
  });
});

describe("media panel model (survey-media spec 6.2, 4.6; SM-29)", () => {
  it("lists required rows with their state and the optional pairs apart, asset first then spaces", () => {
    const model = modelFor(viewFor(), listOf([item("M1")]));
    expect(model.required.map((row) => [row.spaceCode, row.category, row.state, row.readyCount])).toEqual([
      [null, "EXTERIOR_ACCESS", "COVERED", 1],
      ["P101", "MAIN_SPACE", "PROCESSING", 0],
      ["P101", "KITCHEN", "NOT_REQUIRED", 0],
      ["P102", "MAIN_SPACE", "MISSING", 0],
    ]);
    expect(model.required[2].notRequiredReason).toBe("No kitchen");
    expect(model.optional.map((row) => [row.spaceCode, row.category])).toEqual([[null, "DETAIL"]]);
  });

  it("groups the grid by placement and category, in G1 order, and names a renamed space 'uploaded as'", () => {
    const list = listOf([
      item("M3", { spaceId: P2, category: "MAIN_SPACE", spaceCodeAtUpload: "P102" }),
      item("M1", { spaceId: P1, category: "MAIN_SPACE", spaceCodeAtUpload: "OLD1" }),
      item("M2"),
    ]);
    const model = modelFor(viewFor(), list);
    expect(model.groups.map((group) => [group.spaceCode, group.category, group.photos.map((photo) => photo.id)])).toEqual([
      [null, "EXTERIOR_ACCESS", ["M2"]],
      ["P101", "MAIN_SPACE", ["M1"]],
      ["P102", "MAIN_SPACE", ["M3"]],
    ]);
    expect(model.groups[1].photos[0].uploadedAs).toBe("OLD1");
    expect(model.groups[2].photos[0].uploadedAs).toBeNull();
  });

  it("uploadAndRemove_onlyHolderOfEditable: the holder of an editable checklist uploads and removes", () => {
    const model = modelFor(viewFor(), listOf([item("M1")]));
    expect(model.canUpload).toBe(true);
    expect(model.groups[0].photos[0].canRemove).toBe(true);
  });

  it("uploadAndRemove_onlyHolderOfEditable: no upload while the server says uploads are off", () => {
    expect(modelFor(viewFor(), listOf([item("M1")], { uploadEnabled: false })).canUpload).toBe(false);
  });

  it("managerViewer_gridWithoutControls: a manager sees the grid and the viewer without upload or Remove", () => {
    const view = viewFor({ editable: false, readOnlyReason: "NOT_ASSIGNEE" });
    const model = modelFor(view, listOf([item("M1")], { uploadEnabled: false }), B);
    expect(model.canUpload).toBe(false);
    expect(model.groups[0].photos[0]).toMatchObject({ canRemove: false, canView: true });
  });

  it("nobodyButHolderSeesRemove: not on a read-only checklist, not for another viewer even if editable is sent", () => {
    const readOnly = modelFor(viewFor({ editable: false, readOnlyReason: "NEWER_VISIT" }), listOf([item("M1")]));
    expect(readOnly.groups[0].photos[0].canRemove).toBe(false);
    expect(readOnly.canUpload).toBe(false);
    const other = modelFor(viewFor({ holderUserId: B }), listOf([item("M1")]), A);
    expect(other.groups[0].photos[0].canRemove).toBe(false);
    expect(other.canUpload).toBe(false);
  });

  it("holderSeesRemoveOnHeldPhoto: the holder still removes a held photo", () => {
    const held = item("M1", { held: { at: "2026-11-02T03:00:00Z", byUserId: null, byName: null, reason: null }, caption: null, captionHidden: true, contentAvailable: false, unavailableReason: "HELD" });
    expect(modelFor(viewFor(), listOf([held])).groups[0].photos[0]).toMatchObject({ canRemove: true, badge: "held" });
  });

  it("heldPhoto_nonAdminSeesNoCaptionActorReason: held since, no image, caption, actor or reason", () => {
    const held = item("M1", {
      held: { at: "2026-11-02T03:00:00Z", byUserId: null, byName: null, reason: null },
      caption: "should not show",
      captionHidden: true,
      contentAvailable: false,
      unavailableReason: "HELD",
    });
    const photo = modelFor(viewFor(), listOf([held])).groups[0].photos[0];
    expect(photo).toMatchObject({ badge: "held", caption: null, showImage: false, canView: false });
    expect(photo.held).toEqual({ at: "2026-11-02T03:00:00Z", byName: null, reason: null });
  });

  it("internalOnlyTextAlwaysPresent: the internal-only text and the guidance in every state", () => {
    for (const model of [
      modelFor(viewFor(), listOf([])),
      modelFor(viewFor({ editable: false, readOnlyReason: "NEWER_VISIT" }), listOf([], { uploadEnabled: false })),
      modelFor(viewFor(), listOf([], { servingEnabled: false, intakePaused: true, uploadEnabled: false })),
    ]) {
      expect(model.notices).toEqual(["internalOnly", "noPeople", "thisVisitOnly"]);
    }
  });

  it("noListingOrSubmissionControl: the panel offers only upload, view, download, remove, hold and release", () => {
    expect([...PANEL_ACTIONS].sort()).toEqual(["download", "hold", "release", "remove", "upload", "view"]);
  });

  it("serving off or content unavailable: no image is fetched", () => {
    const model = modelFor(viewFor(), listOf([item("M1")], { servingEnabled: false }));
    expect(model.servingEnabled).toBe(false);
    expect(model.groups[0].photos[0].showImage).toBe(false);
    const processing = modelFor(viewFor(), listOf([item("M1", { status: "PROCESSING", contentAvailable: false, unavailableReason: "NOT_READY" })]));
    expect(processing.groups[0].photos[0]).toMatchObject({ badge: "processing", showImage: false });
  });

  it("lists not accepted and removed photos apart, removed with who and when, without image", () => {
    const removed = item("M5", {
      removed: { at: "2026-11-02T05:00:00Z", byUserId: A, byName: "Anh Sale", kind: "HOLDER", correction: null, bySaveId: null },
      contentAvailable: false,
      unavailableReason: "REMOVED",
    });
    const rejected = item("M6", { status: "REJECTED", statusReason: "MOTION_PHOTO", contentAvailable: false });
    const model = modelFor(viewFor(), listOf([], { removedItems: [removed], notAcceptedItems: [rejected] }));
    expect(model.removed).toEqual([{ id: "M5", mediaNo: 5, category: "EXTERIOR_ACCESS", spaceCode: null, at: "2026-11-02T05:00:00Z", byName: "Anh Sale", kind: "HOLDER" }]);
    expect(model.notAccepted.map((photo) => [photo.id, photo.badge, photo.statusReason])).toEqual([["M6", "notAccepted", "MOTION_PHOTO"]]);
  });
});

describe("removalNeedsCorrection (spec 4.7, BR-12)", () => {
  it("asks a correction only for another uploader's committed photo", () => {
    expect(removalNeedsCorrection(item("M1", { uploadedByUserId: B, status: "READY" }), A)).toBe(true);
    expect(removalNeedsCorrection(item("M1", { uploadedByUserId: B, status: "PROCESSING" }), A)).toBe(true);
    expect(removalNeedsCorrection(item("M1", { uploadedByUserId: A, status: "READY" }), A)).toBe(false);
    for (const status of ["AWAITING_CONTENT", "RECEIVING", "REJECTED", "FAILED", "CANCELLED", "UPLOAD_EXPIRED"] as const) {
      expect(removalNeedsCorrection(item("M1", { uploadedByUserId: B, status }), A)).toBe(false);
    }
  });
});

describe("uploadRowStatus (SM-27: each row its own state, never ready before the server says READY)", () => {
  const row = (state: Parameters<typeof uploadRowStatus>[0]["state"]) => ({ state, mediaId: "M1" });

  it("follows the photo in the list once the server has the bytes", () => {
    expect(uploadRowStatus(row("processing"), null)).toEqual({ state: "processing", reason: null });
    expect(uploadRowStatus(row("processing"), item("M1", { status: "PROCESSING" }))).toEqual({ state: "processing", reason: null });
    expect(uploadRowStatus(row("processing"), item("M1", { status: "READY" }))).toEqual({ state: "ready", reason: null });
    expect(uploadRowStatus(row("processing"), item("M1", { status: "REJECTED", statusReason: "ANIMATED" }))).toEqual({
      state: "notAccepted",
      reason: "ANIMATED",
    });
    expect(uploadRowStatus(row("processing"), item("M1", { status: "FAILED", statusReason: "PROCESSING_UNAVAILABLE" }))).toEqual({
      state: "notAccepted",
      reason: "PROCESSING_UNAVAILABLE",
    });
    expect(
      uploadRowStatus(row("processing"), item("M1", { removed: { at: "x", byUserId: A, kind: "HOLDER" } })),
    ).toEqual({ state: "removed", reason: null });
  });

  it("keeps the queue's own state before that", () => {
    expect(uploadRowStatus(row("uploading"), item("M1", { status: "READY" }))).toEqual({ state: "uploading", reason: null });
    expect(uploadRowStatus({ state: "failed", mediaId: null }, null)).toEqual({ state: "failed", reason: null });
  });
});

describe("ADMIN security hold (survey-media A-23, spec 6.2; SM-29 hold part)", () => {
  const heldFull = { at: "2026-11-02T03:00:00Z", byUserId: B, byName: "Binh Admin", reason: "SECURITY_INCIDENT" as const };

  it("holdAndRelease_onlyForCanHold_alsoReadOnly", () => {
    const readOnly = viewFor({ editable: false, readOnlyReason: "NEWER_VISIT" });
    const items = [item("M1"), item("M2", { held: heldFull }), item("M3", { status: "PROCESSING", contentAvailable: false })];
    const admin = modelFor(readOnly, listOf(items, { canHold: true, uploadEnabled: false }), B);
    const [ready, held, processing] = admin.groups[0].photos;
    expect([ready.canHold, ready.canRelease]).toEqual([true, false]);
    expect([held.canHold, held.canRelease]).toEqual([false, true]);
    expect(processing.canHold).toBe(true);
    expect(admin.canHold).toBe(true);
    const sale = modelFor(viewFor(), listOf(items, { canHold: false }));
    for (const photo of sale.groups[0].photos) expect([photo.canHold, photo.canRelease]).toEqual([false, false]);
  });

  it("holdAndRelease_onlyForCanHold_alsoReadOnly: never on a removed or not accepted photo", () => {
    const rejected = item("M6", { status: "REJECTED", contentAvailable: false });
    const model = modelFor(viewFor(), listOf([], { canHold: true, notAcceptedItems: [rejected] }), B);
    expect(model.notAccepted[0]).toMatchObject({ canHold: false, canRelease: false });
  });

  it("adminSeesHeldImageActorReasonCaption", () => {
    const held = item("M1", { held: heldFull, caption: "Router label", captionHidden: false, contentAvailable: true });
    const photo = modelFor(viewFor(), listOf([held], { canHold: true }), B).groups[0].photos[0];
    expect(photo).toMatchObject({ badge: "held", showImage: true, canView: true, caption: "Router label" });
    expect(photo.held).toEqual({ at: heldFull.at, byName: "Binh Admin", reason: "SECURITY_INCIDENT" });
  });

  it("saleSeesHeldSinceWithoutImageCaptionActorReason", () => {
    const held = item("M1", {
      held: { at: heldFull.at, byUserId: null, byName: null, reason: null },
      caption: null,
      captionHidden: true,
      contentAvailable: false,
      unavailableReason: "HELD",
    });
    const photo = modelFor(viewFor(), listOf([held]), A).groups[0].photos[0];
    expect(photo).toMatchObject({ badge: "held", showImage: false, canView: false, caption: null, canHold: false, canRelease: false });
    expect(photo.held).toEqual({ at: heldFull.at, byName: null, reason: null });
  });

  it("holderSeesRemoveOnHeldPhoto (v1-3: the removal goes through, the content is kept until the release)", () => {
    const held = item("M1", { held: { at: heldFull.at, byUserId: null, byName: null, reason: null }, captionHidden: true, caption: null, contentAvailable: false });
    expect(modelFor(viewFor(), listOf([held]), A).groups[0].photos[0].canRemove).toBe(true);
    expect(modelFor(viewFor({ editable: false, readOnlyReason: "NOT_ASSIGNEE" }), listOf([held], { canHold: true }), B).groups[0].photos[0].canRemove).toBe(false);
  });

  it("captionHiddenAfterCredentialExposureRelease: no hold any more, the caption stays hidden for non-ADMIN", () => {
    const released = item("M1", { held: null, caption: null, captionHidden: true });
    const photo = modelFor(viewFor(), listOf([released]), A).groups[0].photos[0];
    expect(photo).toMatchObject({ badge: "ready", caption: null, showImage: true });
    const shownAgain = item("M1", { held: null, caption: "Do not show", captionHidden: true });
    expect(modelFor(viewFor(), listOf([shownAgain]), A).groups[0].photos[0].caption).toBeNull();
  });
});
