// Which private views (pages behind `RequireSession`) this tab still holds. Next keeps recently visited routes mounted
// but hidden (React `<Activity>`), with their DOM and state, after a client-side navigation to a public page. The
// effects of a hidden route are torn down, so it cannot see a session change itself; this registry lets the cross-tab
// sync know a full page load is needed to drop that private data (auth-browser-session §4.5, §4.7).

/** A DOM node a private view renders: it stays connected while the route is hidden, and leaves on a real unmount. */
export type PrivateViewMarker = { readonly isConnected: boolean };

export function createPrivateViewRegistry() {
  const markers = new Set<PrivateViewMarker>();
  return {
    /** Called by a private view when it is shown; registering the same marker again counts once. */
    register(marker: PrivateViewMarker): void {
      markers.add(marker);
    },
    /** True while any registered marker is still in the document (shown or hidden). */
    anyMounted(): boolean {
      for (const marker of markers) {
        if (marker.isConnected) return true;
        markers.delete(marker);
      }
      return false;
    },
  };
}

/** The tab's registry. Module state only: nothing is put on `window` or another global. */
export const privateViews = createPrivateViewRegistry();
