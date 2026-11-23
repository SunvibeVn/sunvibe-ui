// Constants of the workspace with no imports, so Server Components (layouts, pages) can use them without loading
// any browser session module.

/** Roles that may open the staff workspace (spec 5.1). A UX gate only: the API decides every call (BR-1). */
export const STAFF_WORKSPACE_ROLES = ["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;

/** Where the workspace entry points lead. */
export const WORKSPACE_HOME = "/workspace/owner-leads";

/** The survey list (survey-schedule spec 6.5). */
export const SURVEYS_PATH = "/workspace/surveys";

/** The brokerage agreement list; each agreement's page is below it (brokerage-agreement E05-S7, S7-D12). */
export const BROKERAGE_AGREEMENTS_PATH = "/workspace/brokerage-agreements";

/** Each listing's page is below it (listing-publish E06-S1, E06S1-D12); the listing list itself is E06-S16's. */
export const LISTINGS_PATH = "/workspace/listings";

/** The listings whose freshness confirmation is due again (listing-publish E06-S3, E06S3-D13). */
export const LISTING_RECONFIRMATIONS_PATH = "/workspace/listings/reconfirmations";

/** The duplicate cases of the inventory intake (property-create intake 7.2). */
export const INVENTORY_CASES_PATH = "/workspace/inventory-cases";

/** Who may read those cases; the API decides who may read each one (spec 4.3). */
export const INVENTORY_CASE_ROLES = ["SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;

/** The Pending review revisions a listing reviewer decides on (listing-publish E06-S4, E06S4-D10); each review is below. */
export const LISTING_REVIEWS_PATH = "/workspace/listings/reviews";

/** Who may read the review queue and a revision's review; only a listing reviewer or ADMIN decides (E06S4-D2). */
export const LISTING_REVIEW_ROLES = ["SALE_LEADER", "SALES_MANAGER", "ADMIN", "LISTING_REVIEWER"] as const;

/**
 * Who may open the workspace shell: the staff roles and the listing reviewer (E06S4-D16). Each page admits its own
 * roles inside the frame (`pageRolesOf`); a UX gate only, the API decides every call.
 */
export const WORKSPACE_ROLES = ["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN", "LISTING_REVIEWER"] as const;
