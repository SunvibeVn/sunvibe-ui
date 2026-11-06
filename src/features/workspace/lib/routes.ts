// Constants of the workspace with no imports, so Server Components (layouts, pages) can use them without loading
// any browser session module.

/** Roles that may open the staff workspace (spec 5.1). A UX gate only: the API decides every call (BR-1). */
export const STAFF_WORKSPACE_ROLES = ["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;

/** Where the workspace entry points lead. */
export const WORKSPACE_HOME = "/workspace/owner-leads";

/** The survey list (survey-schedule spec 6.5). */
export const SURVEYS_PATH = "/workspace/surveys";

/** The duplicate cases of the inventory intake (property-create intake 7.2). */
export const INVENTORY_CASES_PATH = "/workspace/inventory-cases";

/** Who may read those cases; the API decides who may read each one (spec 4.3). */
export const INVENTORY_CASE_ROLES = ["SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;
