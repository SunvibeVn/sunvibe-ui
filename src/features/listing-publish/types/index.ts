import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

// Listing publication, the create and the two staff reads (listing-publish E06-S1). Every property of these schemas is
// required in the contract and none is nullable (E06S1-P7).

/** The answer of a created listing: its internal id (staff only) and its public code, which never changes. */
export type ListingCreated = Schemas["ListingCreated"];
/** One listing with at most its 20 newest revisions, newest first (E06S1-D17); nothing of it is public. */
export type ListingDetail = Schemas["ListingDetail"];
export type ListingRevisionItem = Schemas["ListingRevisionItem"];
/** The agreement's 20 newest listings and whether the caller may create one now (a hint; the server decides). */
export type AgreementListings = Schemas["AgreementListings"];
export type ListingItem = Schemas["ListingItem"];
export type ListingCreation = Schemas["ListingCreation"];

// Drafting a revision and submitting it for review (listing-publish E06-S2). `ListingDetail.openRevisionNo` is the one
// nullable field of E06-S1's schemas (E06S2-D20); the revision's nullable parts are its texts, its snapshots, its
// submission time, the four option features and the optional parts of the deposit and the fees.

/** One revision with the problems a Draft's submission would answer now (E06S2-D14); no user id. */
export type ListingRevisionDetail = Schemas["ListingRevisionDetail"];
/** The answer of every revision command: the revision's number and status, and the listing's new data version. */
export type ListingRevisionChange = Schemas["ListingRevisionChange"];
/** What a terms snapshot can be taken from now: E05's version in effect and the one waiting to start (E06S2-D14). */
export type ListingTermsSources = Schemas["ListingTermsSources"];
export type ListingTermsSnapshot = Schemas["ListingTermsSnapshot"];
export type ListingTerms = Schemas["ListingTerms"];
export type ListingFee = Schemas["ListingFee"];
export type ListingFeatures = Schemas["ListingFeatures"];
/** One rule a submission refuses: a part and a rule, never the text that matched (E06S2-D7). */
export type ListingRevisionProblem = Schemas["ListingRevisionProblem"];
/** The unit and property fields taken at the submission (E06S2-D12). */
export type ListingUnitSnapshot = Schemas["ListingUnitSnapshot"];
/** The body of a save: the whole title, description and thirteen features (E06S2-D4). */
export type ListingRevisionContentBody = Schemas["ListingRevisionContent"];

// Recording the freshness confirmation (listing-publish E06-S3). The three dates and `latest` are null until a valid
// confirmation or a first record; in `latest` the two answers are set exactly for AVAILABLE and the note is optional.

/** The listing's freshness: the dates, the two flags and the latest record with its private note; no user id. */
export type ListingFreshness = Schemas["ListingFreshness"];
export type ListingFreshnessRecord = Schemas["ListingFreshnessRecord"];
/** The body of a record: no date, the server sets today in Vietnam time (E06S3-D4). */
export type ListingFreshnessRecordRequest = Schemas["ListingFreshnessRecordRequest"];
/** The answer of a record: whether it is a valid confirmation and the listing's new data version. */
export type ListingFreshnessRecorded = Schemas["ListingFreshnessRecorded"];
/** At most 50 listings to reconfirm, oldest confirmation first, and whether more may need it (E06S3-D7). */
export type ListingReconfirmations = Schemas["ListingReconfirmations"];
export type ListingReconfirmationItem = Schemas["ListingReconfirmationItem"];

// The independent review of a submitted revision (listing-publish E06-S4). Nullable: E05's answer, its end date and its
// two terms, the unit's code and availability, the four freshness fields, and the decision's checklist version,
// rejection group and note; the real location's four fields.

/** At most 50 Pending review revisions, oldest submission first, and whether more are waiting (E06S4-D10). */
export type ListingReviewQueue = Schemas["ListingReviewQueue"];
export type ListingReviewQueueItem = Schemas["ListingReviewQueueItem"];
/** What a reviewer reads beside a revision; never the real location (E06S4-D11). */
export type ListingRevisionReview = Schemas["ListingRevisionReview"];
/** The body of a decision: only the chosen outcome's fields (E06S4-D6, E06S4-P10). */
export type ListingRevisionDecisionRequest = Schemas["ListingRevisionDecisionRequest"];
/** A revision's decision with its reasons and private note; no reviewer id (E06S4-D15). */
export type ListingRevisionDecision = Schemas["ListingRevisionDecision"];
/** The unit's real location, opened by an eligible reviewer and logged by the server (E06S4-D12). */
export type ListingUnitLocation = Schemas["ListingUnitLocation"];

// Putting an approved revision live (listing-publish E06-S6). Every property is required; only the publication's `live`
// and `approved` are nullable (both null for a listing read as archived), and the live difference's `live` (null unless
// another revision is live). Nothing of these answers is public.

/** The live revision and the Approved revision waiting, each with its display answer, and what the viewer may do. */
export type ListingPublication = Schemas["ListingPublication"];
export type ListingPublicationLive = Schemas["ListingPublicationLive"];
export type ListingPublicationApproved = Schemas["ListingPublicationApproved"];
/** Whether a revision's display conditions hold now: the reasons in their fixed order and E05's groups. */
export type ListingDisplayAnswer = Schemas["ListingDisplayAnswer"];
/** What a revision changes against the live revision, by value (E06S6-D12). */
export type ListingLiveDifference = Schemas["ListingLiveDifference"];
export type ListingLiveRevision = Schemas["ListingLiveRevision"];
