import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

// Survey checklists (survey-checklist spec 7). The W16 contract marks every nullable field and reference as such, so
// these are the generated types as they are (no `ApiShape`): a field the contract leaves optional may still be absent.

/** The checklist as one viewer reads it: groups, readiness, computed parts and who may edit (spec 7.2). */
export type ChecklistView = Schemas["ChecklistResponse"];
export type ChecklistGroups = Schemas["ChecklistGroups"];
export type ChecklistVisit = Schemas["ChecklistVisit"];
export type ChecklistUnitMeta = Schemas["ChecklistUnitMeta"];
export type ChecklistReadiness = Schemas["ChecklistReadiness"];
export type ChecklistMissingItem = Schemas["ChecklistMissingItem"];
export type ChecklistUnconfirmedTerm = Schemas["ChecklistUnconfirmedTerm"];
export type ChecklistWarning = Schemas["ChecklistWarning"];
export type ChecklistTakeover = Schemas["ChecklistTakeover"];
export type ChecklistCorrection = Schemas["ChecklistCorrection"];
export type ChecklistEditor = Schemas["ChecklistEditor"];
export type ChecklistStaffMember = Schemas["ChecklistStaffMember"];
export type ChecklistOwnerForm = Schemas["ChecklistOwnerForm"];
export type ChecklistEarlierHazard = Schemas["ChecklistEarlierHazard"];
export type ChecklistSpaceTerms = Schemas["ChecklistSpaceTerms"];
export type ChecklistEffectiveCharge = Schemas["ChecklistEffectiveCharge"];
export type ChecklistHistoryEntry = Schemas["ChecklistHistoryEntryResponse"];
/** Answer of a start: the checklist, the lead state (LAST UPDATE) and the History row (spec 7.1). */
export type ChecklistStarted = Schemas["ChecklistStartedResponse"];
export type ChecklistTakenOver = Schemas["ChecklistTakenOverResponse"];
/** A takeover's checkpoint: the takeover and the groups as they were just before it (W16-28). */
export type ChecklistCheckpoint = Schemas["ChecklistCheckpointResponse"];
/** The checklist line of a VISITED appointment in the survey block. */
export type ChecklistSummary = Schemas["ChecklistSummaryResponse"];
/** `checklistStart` of the survey block: start allowed, the visit, intake needed, or the first block. */
export type ChecklistStartState = Schemas["ChecklistStartStateResponse"];

export type ChecklistStartInput = Schemas["ChecklistStartRequest"];
export type ChecklistTakeoverInput = Schemas["ChecklistTakeoverRequest"];
export type ChecklistCorrectionInput = Schemas["ChecklistCorrectionRequest"];
export type ChecklistBasisInput = Schemas["ChecklistBasisRequest"];
export type ChecklistOtherGroupVersions = Schemas["ChecklistOtherGroupVersions"];

export type ChecklistReadOnlyReason = NonNullable<ChecklistView["readOnlyReason"]>;
export type ChecklistStartBlock = NonNullable<ChecklistStartState["blockedBy"]>;
export type ChecklistGroupName = NonNullable<ChecklistCorrection["group"]>;

/** Path segment of a group save (`PUT /survey-checklists/{id}/<group>`); G7 has no content in template v1. */
export type ChecklistGroupPath = "identification" | "parts" | "dimensions" | "condition" | "safety" | "amenities" | "terms";

/** The seven saved groups in the order G1..G6, G8 (spec 4.6). */
export const CHECKLIST_GROUP_PATHS = [
  "identification",
  "parts",
  "dimensions",
  "condition",
  "safety",
  "amenities",
  "terms",
] as const satisfies readonly ChecklistGroupPath[];

/** The API's group name of each path (`corrections[].group`, a History save's `referenceDetail`). */
export const CHECKLIST_GROUP_NAME: Record<ChecklistGroupPath, ChecklistGroupName> = {
  identification: "IDENTIFICATION",
  parts: "PARTS",
  dimensions: "DIMENSIONS",
  condition: "CONDITION",
  safety: "SAFETY",
  amenities: "AMENITIES",
  terms: "TERMS",
};

/** The stored content of each group, as a read returns it (values plus `meta` and server fields). */
export type ChecklistContent = {
  identification: Schemas["ChecklistIdentificationContent"];
  parts: Schemas["ChecklistPartsContent"];
  dimensions: Schemas["ChecklistDimensionsContent"];
  condition: Schemas["ChecklistConditionContent"];
  safety: Schemas["ChecklistSafetyContent"];
  amenities: Schemas["ChecklistAmenitiesContent"];
  terms: Schemas["ChecklistTermsContent"];
};

/** The input of each group: values only, every key present (A-4). */
export type ChecklistInput = {
  identification: Schemas["ChecklistIdentificationInput"];
  parts: Schemas["ChecklistPartsInput"];
  dimensions: Schemas["ChecklistDimensionsInput"];
  condition: Schemas["ChecklistConditionInput"];
  safety: Schemas["ChecklistSafetyInput"];
  amenities: Schemas["ChecklistAmenitiesInput"];
  terms: Schemas["ChecklistTermsInput"];
};

/** The body of each group save; only `identification` may carry `otherGroupVersions` (A-12). */
export type ChecklistSaveBody = {
  identification: Schemas["ChecklistSaveIdentificationRequest"];
  parts: Schemas["ChecklistSavePartsRequest"];
  dimensions: Schemas["ChecklistSaveDimensionsRequest"];
  condition: Schemas["ChecklistSaveConditionRequest"];
  safety: Schemas["ChecklistSaveSafetyRequest"];
  amenities: Schemas["ChecklistSaveAmenitiesRequest"];
  terms: Schemas["ChecklistSaveTermsRequest"];
};

export type ChecklistObservedSpace = Schemas["ChecklistObservedSpace"];
export type ChecklistObservedLocation = Schemas["ChecklistObservedLocation"];
export type ChecklistHazard = Schemas["ChecklistHazard"];
export type ChecklistHazardInput = Schemas["ChecklistHazardInput"];
export type ChecklistAmenityItem = Schemas["ChecklistAmenityItem"];
export type ChecklistAmenityItemInput = Schemas["ChecklistAmenityItemInput"];
export type ChecklistOtherItem = Schemas["ChecklistOtherItem"];
export type ChecklistOtherItemInput = Schemas["ChecklistOtherItemInput"];
export type ChecklistAreaCheck = Schemas["ChecklistAreaCheck"];
export type ChecklistCharge = Schemas["ChecklistCharge"];
export type ChecklistFee = Schemas["ChecklistFee"];
export type ChecklistAmenityCode = ChecklistAmenityItemInput["code"];
/** Every source a unit can hold (`meta.lastSource`). */
export type ChecklistSource = NonNullable<ChecklistUnitMeta["lastSource"]>;
export type ChecklistFieldState = "UNKNOWN" | "VALUE" | "NOT_APPLICABLE";
