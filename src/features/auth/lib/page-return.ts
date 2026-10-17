// sessionStorage fires no event in the tab that writes it. With `cacheComponents`, Next keeps a page left by a
// navigation hidden (React `<Activity>`), so after Back a step page could show the progress it read before. These
// events tell the page to read again; App Router Back is a `popstate`, which fires none of the others.

type Listenable = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

const WINDOW_EVENTS = ["pageshow", "popstate", "focus"] as const;
const DOCUMENT_EVENTS = ["visibilitychange"] as const;

/** Calls `notify` on Back/Forward, when the page is shown again, becomes visible or gets focus; returns the unsubscribe. */
export function subscribePageReturn(env: { window: Listenable; document: Listenable }, notify: () => void): () => void {
  const listener = () => notify();
  for (const type of WINDOW_EVENTS) env.window.addEventListener(type, listener);
  for (const type of DOCUMENT_EVENTS) env.document.addEventListener(type, listener);
  return () => {
    for (const type of WINDOW_EVENTS) env.window.removeEventListener(type, listener);
    for (const type of DOCUMENT_EVENTS) env.document.removeEventListener(type, listener);
  };
}
