/** The part of the Navigation API the guard uses (TypeScript's DOM library does not describe it yet). */
export interface GuardNavigation {
  addEventListener(type: "navigate", listener: (event: Event) => void): void;
  removeEventListener(type: "navigate", listener: (event: Event) => void): void;
}

/** The fields of a `NavigateEvent` the guard reads. */
type NavigateEventFields = { navigationType?: string; destination?: { url?: string } };

export interface HistoryGuardHost {
  /** `window.navigation`; missing in a browser without the Navigation API. */
  navigation: GuardNavigation | undefined;
  pathname(): string;
  confirm(text: string): boolean;
}

/**
 * Asks before Back or Forward leaves the page (SV-010; survey-checklist spec 6.2, survey-media spec 6.2). The App
 * Router renders a traversal from its own `popstate` listener, which runs before any listener the page adds, so the
 * guard asks earlier: on the Navigation API's `navigate` event, before the browser moves. "Stay" cancels the
 * traversal (the URL, the page, its drafts and its uploads stay as they are); "leave" lets it go. Traversals within the
 * same path (the Edit and Preview tabs) ask nothing. A traversal the browser does not let the page cancel is left
 * alone: one to another document unloads the page and the `beforeunload` prompt asks, and the browser refuses a second
 * cancel without a user action in between, so Back always gets the user out (the drafts stay in tab memory). Without
 * the Navigation API the guard installs nothing (the unload and link guards still ask).
 */
export function installHistoryGuard(host: HistoryGuardHost, text: string): () => void {
  const { navigation } = host;
  if (navigation === undefined) return () => {};

  const onNavigate = (event: Event) => {
    const { navigationType, destination } = event as Event & NavigateEventFields;
    if (navigationType !== "traverse" || !event.cancelable || destination?.url === undefined) return;
    if (new URL(destination.url).pathname === host.pathname()) return;
    if (!host.confirm(text)) event.preventDefault();
  };

  navigation.addEventListener("navigate", onNavigate);
  return () => navigation.removeEventListener("navigate", onNavigate);
}
