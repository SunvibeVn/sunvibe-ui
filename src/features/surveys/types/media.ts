import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

// Survey photos of a checklist draft (survey-media spec 7.2): the generated types as they are; a field the contract
// leaves optional may still be absent.

/** `GET /survey-checklists/{id}/media`: the photos, their coverage, limits and switches for one viewer. */
export type MediaList = Schemas["ChecklistMediaResponse"];
/** One photo as one viewer may see it (held photos without caption, actor or reason for a viewer without `canHold`). */
export type MediaItem = Schemas["SurveyMediaItem"];
export type MediaCoverage = Schemas["ChecklistMediaCoverage"];
export type MediaLimits = Schemas["ChecklistMediaLimits"];
/** The versions a list was computed from (A-30): with `setVersion` they make its `knownVersion`. */
export type MediaBasis = Schemas["ChecklistMediaBasis"];
export type MediaHold = Schemas["SurveyMediaHold"];
export type MediaRemoval = Schemas["SurveyMediaRemoval"];
/** `media` of a checklist read (A-1): whether photos exist in this release and whether this viewer may upload now. */
export type ChecklistMediaState = Schemas["ChecklistMedia"];

export type MediaCreateInput = Schemas["MediaCreateRequest"];
export type MediaRemovalInput = Schemas["MediaRemovalRequest"];
export type MediaCreated = Schemas["SurveyMediaCreateResponse"];
/** Answer of the content upload and of a removal: the photo, the set version and the History row (or null). */
export type MediaContentAnswer = Schemas["SurveyMediaContentResponse"];
/** Answer of a hold or a release (ADMIN, A-23). */
export type MediaStateAnswer = Schemas["SurveyMediaStateResponse"];

export type MediaStatus = NonNullable<MediaItem["status"]>;
export type MediaStatusReason = NonNullable<MediaItem["statusReason"]>;
export type MediaCategory = NonNullable<MediaItem["category"]>;
export type MediaUnavailableReason = NonNullable<MediaItem["unavailableReason"]>;
export type MediaCoverageState = NonNullable<MediaCoverage["state"]>;
export type MediaHoldReason = NonNullable<Schemas["MediaHoldRequest"]["reason"]>;

/** The three served variants of a photo (`GET /survey-media/{id}/content/{variant}`). */
export type MediaVariant = "thumbnail" | "preview" | "full";
