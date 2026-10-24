// Public entry point for Server Components (layouts and pages). The workspace reads staff data only in the browser;
// the client components below render their data after hydration.
export { WorkspaceAccountCard } from "./components/workspace-account-card";
export { WorkspaceLink } from "./components/workspace-link";
export { WorkspaceShell } from "./components/workspace-shell";
export { STAFF_WORKSPACE_ROLES, SURVEYS_PATH, WORKSPACE_HOME } from "./lib/routes";
export { type Scope, type Viewer, viewerOf } from "./lib/viewer";
