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
