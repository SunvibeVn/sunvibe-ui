import type {
  ChecklistView,
  MediaCategory,
  MediaCoverageState,
  MediaItem,
  MediaList,
  MediaStatusReason,
} from "@/features/surveys";

// The Photos panel of the checklist page (survey-media spec 6.2, 4.6; SM-29): required and optional pairs with their
// coverage, the grid by placement and category, the not accepted and removed lists, and what this viewer may do. Only
// the holder of an editable checklist uploads and removes (held photos included, A-23); everyone who sees the lead
// views; Hold and Release come with `canHold` (ADMIN). Nothing here suggests listing use or submission (C-2).

/** The categories in the order of spec 4.6. */
export const MEDIA_CATEGORIES = [
  "EXTERIOR_ACCESS",
  "MAIN_SPACE",
  "KITCHEN",
  "BATHROOM",
  "SHARED_KITCHEN",
  "SHARED_BATHROOM",
  "SHARED_AMENITY",
  "DETAIL",
] as const satisfies readonly MediaCategory[];

/** Every control the panel has (SM-29: none for listing use or submission). */
export const PANEL_ACTIONS = ["upload", "view", "download", "remove", "hold", "release"] as const;

/** The texts shown in every state of the panel (US-3 AC-1, BR-7 and BR-20 as guidance). */
export type PanelNotice = "internalOnly" | "noPeople" | "thisVisitOnly";
const NOTICES: readonly PanelNotice[] = ["internalOnly", "noPeople", "thisVisitOnly"];

export type PhotoBadge =
  | "uploading"
  | "processing"
  | "ready"
  | "held"
  | "notAccepted"
  | "notProcessed"
  | "removedWhileProcessing"
  | "notUploaded";

export type PhotoCard = {
  id: string;
  mediaNo: number;
  category: MediaCategory;
  spaceId: string | null;
  badge: PhotoBadge;
  statusReason: MediaStatusReason | null;
  /** Null when there is none or it is hidden for this viewer (held, or released after CREDENTIAL_EXPOSURE). */
  caption: string | null;
  /** The space code at upload when the space was renamed since ("uploaded as P101", A-9). */
  uploadedAs: string | null;
  uploadedByName: string | null;
  /** While held: the time for everyone, actor and reason only for a viewer with `canHold`. */
  held: { at: string; byName: string | null; reason: string | null } | null;
  /** A thumbnail is read for it: READY, content available to this viewer, serving on. */
  showImage: boolean;
  /** The viewer (PREVIEW, Download of FULL) opens for it. */
  canView: boolean;
  canRemove: boolean;
  canHold: boolean;
  canRelease: boolean;
};

export type CoverageRow = {
  spaceId: string | null;
  spaceCode: string | null;
  category: MediaCategory;
  state: MediaCoverageState;
  readyCount: number;
  notRequiredReason: string | null;
};

export type GridGroup = { spaceId: string | null; spaceCode: string | null; category: MediaCategory; photos: PhotoCard[] };

export type RemovedCard = {
  id: string;
  mediaNo: number;
  category: MediaCategory;
  spaceCode: string | null;
  at: string;
  byName: string | null;
  kind: "HOLDER" | "CASCADE";
};

export type MediaPanelModel = {
  notices: readonly PanelNotice[];
  required: CoverageRow[];
  optional: CoverageRow[];
  groups: GridGroup[];
  notAccepted: PhotoCard[];
  removed: RemovedCard[];
  /** Not accepted and removed photos the list leaves out (it holds the newest 100 of each, spec 7.2 `totals`). */
  moreNotAccepted: number;
  moreRemoved: number;
  canUpload: boolean;
  canHold: boolean;
  servingEnabled: boolean;
  intakePaused: boolean;
  limits: { maxFileBytes: number; maxSelected: number; selectedCount: number; maxPending: number; pendingCount: number };
};

const BADGE: Record<NonNullable<MediaItem["status"]>, PhotoBadge> = {
  AWAITING_CONTENT: "uploading",
  RECEIVING: "uploading",
  PROCESSING: "processing",
  READY: "ready",
  REJECTED: "notAccepted",
  FAILED: "notProcessed",
  CANCELLED: "removedWhileProcessing",
  UPLOAD_EXPIRED: "notUploaded",
};

const categoryIndex = (category: string | undefined): number => {
  const index = (MEDIA_CATEGORIES as readonly string[]).indexOf(category ?? "");
  return index < 0 ? MEDIA_CATEGORIES.length : index;
};

/** The G1 spaces of the read on screen, in order. */
function spacesOf(view: ChecklistView): { spaceId: string; code: string }[] {
  return (view.groups?.identification?.content?.spaces ?? []).map((space) => ({ spaceId: space.spaceId ?? "", code: space.code ?? "" }));
}

/** The holder of an editable checklist: the only viewer who uploads and removes (spec 4.3). */
export function isEditingHolder(view: ChecklistView, viewerUserId: string): boolean {
  return view.editable === true && view.holderUserId === viewerUserId;
}

/**
 * Whether removing `item` needs the BR-12 correction: its content was committed (PROCESSING, READY) and someone else
 * uploaded it (spec 4.7). The server decides; this only opens the correction box first.
 */
export function removalNeedsCorrection(item: MediaItem, viewerUserId: string): boolean {
  return (item.status === "PROCESSING" || item.status === "READY") && item.uploadedByUserId !== viewerUserId;
}

export type UploadRowShown =
  | "waiting"
  | "hashing"
  | "creating"
  | "uploading"
  | "checking"
  | "retrying"
  | "queued"
  | "processing"
  | "failed"
  | "stopped"
  | "ready"
  | "notAccepted"
  | "removed";

/**
 * What an uploader row shows (SM-27): its own queue state until the server has the bytes, then the photo's state in
 * the list: processing until the list says READY, not accepted with the reason, or removed.
 */
export function uploadRowStatus(
  row: { state: Exclude<UploadRowShown, "ready" | "notAccepted" | "removed">; mediaId: string | null },
  item: MediaItem | null,
): { state: UploadRowShown; reason: MediaStatusReason | null } {
  if (row.state !== "processing" || item === null) return { state: row.state, reason: null };
  if (item.removed) return { state: "removed", reason: null };
  switch (item.status) {
    case "READY":
      return { state: "ready", reason: null };
    case "REJECTED":
    case "FAILED":
    case "CANCELLED":
    case "UPLOAD_EXPIRED":
      return { state: "notAccepted", reason: item.statusReason ?? null };
    default:
      return { state: "processing", reason: null };
  }
}

export function mediaPanelModel(view: ChecklistView, list: MediaList, viewerUserId: string): MediaPanelModel {
  const spaces = spacesOf(view);
  const codeOf = new Map(spaces.map((space) => [space.spaceId, space.code]));
  const placementIndex = (spaceId: string | null | undefined): number => {
    if (!spaceId) return -1;
    const index = spaces.findIndex((space) => space.spaceId === spaceId);
    return index < 0 ? spaces.length : index;
  };
  const byPlacement = <T extends { spaceId?: string | null; category?: string }>(a: T, b: T) =>
    placementIndex(a.spaceId) - placementIndex(b.spaceId) || categoryIndex(a.category) - categoryIndex(b.category);

  const holder = isEditingHolder(view, viewerUserId);
  const servingEnabled = list.servingEnabled !== false;
  const canHold = list.canHold === true;

  const card = (item: MediaItem): PhotoCard => {
    const status = item.status ?? "AWAITING_CONTENT";
    const held = item.held ? { at: item.held.at ?? "", byName: item.held.byName ?? null, reason: item.held.reason ?? null } : null;
    const removed = item.removed !== null && item.removed !== undefined;
    const current = item.spaceId ? (codeOf.get(item.spaceId) ?? null) : null;
    const atUpload = item.spaceCodeAtUpload ?? null;
    const showImage = servingEnabled && status === "READY" && item.contentAvailable === true && !removed;
    return {
      id: item.id ?? "",
      mediaNo: item.mediaNo ?? 0,
      category: item.category ?? "DETAIL",
      spaceId: item.spaceId ?? null,
      badge: held !== null && (status === "PROCESSING" || status === "READY") ? "held" : BADGE[status],
      statusReason: item.statusReason ?? null,
      caption: item.captionHidden === true ? null : (item.caption ?? null),
      uploadedAs: item.spaceId && atUpload !== null && atUpload !== current ? atUpload : null,
      uploadedByName: item.uploadedByName ?? null,
      held,
      showImage,
      canView: showImage,
      canRemove: holder && !removed,
      canHold: canHold && !removed && held === null && (status === "PROCESSING" || status === "READY"),
      canRelease: canHold && held !== null,
    };
  };

  const coverageRows = (list.coverage ?? [])
    .map(
      (entry): CoverageRow => ({
        spaceId: entry.spaceId ?? null,
        spaceCode: entry.spaceId ? (codeOf.get(entry.spaceId) ?? null) : null,
        category: entry.category ?? "DETAIL",
        state: entry.state ?? "MISSING",
        readyCount: entry.readyCount ?? 0,
        notRequiredReason: entry.notRequiredReason ?? null,
      }),
    )
    .sort(byPlacement);

  const groups: GridGroup[] = [];
  for (const item of [...(list.items ?? [])].sort((a, b) => byPlacement(a, b) || (a.mediaNo ?? 0) - (b.mediaNo ?? 0))) {
    const photo = card(item);
    const last = groups.at(-1);
    if (last !== undefined && last.spaceId === photo.spaceId && last.category === photo.category) {
      last.photos.push(photo);
      continue;
    }
    const spaceCode = photo.spaceId ? (codeOf.get(photo.spaceId) ?? item.spaceCodeAtUpload ?? null) : null;
    groups.push({ spaceId: photo.spaceId, spaceCode, category: photo.category, photos: [photo] });
  }

  const limits = list.limits ?? {};
  return {
    notices: NOTICES,
    required: coverageRows.filter((row) => row.state !== "OPTIONAL"),
    optional: coverageRows.filter((row) => row.state === "OPTIONAL"),
    groups,
    notAccepted: (list.notAcceptedItems ?? []).map(card),
    removed: (list.removedItems ?? []).map((item) => ({
      id: item.id ?? "",
      mediaNo: item.mediaNo ?? 0,
      category: item.category ?? "DETAIL",
      spaceCode: item.spaceId ? (codeOf.get(item.spaceId) ?? item.spaceCodeAtUpload ?? null) : null,
      at: item.removed?.at ?? "",
      byName: item.removed?.byName ?? null,
      kind: item.removed?.kind ?? "HOLDER",
    })),
    moreNotAccepted: Math.max(0, (list.totals?.notAccepted ?? 0) - (list.notAcceptedItems ?? []).length),
    moreRemoved: Math.max(0, (list.totals?.removed ?? 0) - (list.removedItems ?? []).length),
    canUpload: holder && list.uploadEnabled === true,
    canHold,
    servingEnabled,
    intakePaused: list.intakePaused === true,
    limits: {
      maxFileBytes: limits.maxFileBytes ?? 20_971_520,
      maxSelected: limits.maxSelected ?? 100,
      selectedCount: limits.selectedCount ?? 0,
      maxPending: limits.maxPending ?? 0,
      pendingCount: limits.pendingCount ?? 0,
    },
  };
}

/**
 * The card the open viewer shows, looked up in the model on screen at every render (SM-FE-07, SM-29): its caption,
 * Download and hold controls follow the latest list, never the copy it opened with. Null closes the viewer: the photo
 * left the grid, or this viewer may no longer view it (held for a viewer without `canHold`, serving off).
 */
export function viewedCard(model: MediaPanelModel, mediaId: string): PhotoCard | null {
  const card = [...model.groups.flatMap((group) => group.photos), ...model.notAccepted].find((photo) => photo.id === mediaId);
  return card !== undefined && card.canView ? card : null;
}
