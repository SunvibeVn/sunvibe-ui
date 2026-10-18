// Constants of the workspace with no imports, so Server Components (layouts, pages) can use them without loading
// any browser session module.

/** Roles that may open the staff workspace (spec 5.1). A UX gate only: the API decides every call (BR-1). */
export const STAFF_WORKSPACE_ROLES = ["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;

/** Where the workspace entry points lead. */
export const WORKSPACE_HOME = "/workspace/owner-leads";
