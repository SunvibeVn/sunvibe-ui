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
