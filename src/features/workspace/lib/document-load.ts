/** The part of `window.performance` the check reads. */
export type NavigationEntries = { getEntriesByType(type: "navigation"): readonly { name: string }[] };

const isWorkspacePath = (pathname: string): boolean => pathname === "/workspace" || pathname.startsWith("/workspace/");

/**
 * True when the document was first loaded at a page outside the workspace and reached it inside the app (a link or a
 * redirect after sign-in) (SM-FE-06, SV-071). The workspace's response headers, its CSP (`frame-ancestors`, the
 * `img-src` of survey-media spec 6.2) and `X-Frame-Options`, belong to the document's own load, and a client-side
 * navigation keeps the policy of the page the document was loaded at; such a document must load the workspace page
 * again. A document first loaded in the workspace keeps its headers while it moves outside and back. Without a
 * navigation entry nothing is judged.
 */
export function loadedOutsideWorkspace(performance: NavigationEntries | undefined): boolean {
  const entry = performance?.getEntriesByType("navigation")[0];
  if (entry === undefined) return false;
  return !isWorkspacePath(new URL(entry.name).pathname);
}
