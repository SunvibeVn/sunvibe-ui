import { readChecklistDraft } from "./checklist-draft";

/** True while any group draft of the checklist holds edits: leaving the page or the tab asks first (spec 6.2). */
export function hasUnsavedChanges(drafts: readonly string[]): boolean {
  return drafts.some((text) => {
    const draft = readChecklistDraft(text);
    return draft !== null && Object.keys(draft.edits).length > 0;
  });
}
