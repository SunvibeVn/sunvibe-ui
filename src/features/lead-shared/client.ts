// Public entry point for Client Components: what the workspace keeps in the memory of this tab (the drafts, the list's
// one-shot notice, the last list URL). The root layout never imports this file: see session-sync.ts.
export {
  createTabMemory,
  type DraftKey,
  type DraftStore,
  lastListUrl,
  listFlash,
  readFormDraft,
  tabDrafts,
  useDraft,
  useDraftSessionSync,
  useFormDraft,
  writeFormDraft,
} from "./lib/drafts";
export type { ListFlashKind } from "./lib/list-flash";
