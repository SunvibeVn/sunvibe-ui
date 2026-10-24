"use client";

import { useCallback, useMemo } from "react";

import type { ChecklistContent, ChecklistGroupPath, ChecklistInput, ChecklistUnitMeta } from "@/features/surveys";

import { checklistDraftKey, readChecklistDraft, writeChecklistDraft } from "../../lib/checklist/checklist-draft";
import { metaOfUnits } from "../../lib/checklist/correction-rule";
import { type GroupEdits, inputOfContent, toGroupInput, type UnitValue, unitsOfInput } from "../../lib/checklist/group-input";
import { withRelayRule } from "../../lib/checklist/receiver-options";
import { sameUnit } from "../../lib/checklist/unit-equality";
import { isPanelLocked } from "../../lib/checklist/page-state";
import { useDraft } from "../../lib/drafts";

import { useChecklistPage } from "./checklist-context";

/** One group's editing state: the stored input, the user's edits (tab-memory draft) and the body they make. */
export type Panel<G extends ChecklistGroupPath = ChecklistGroupPath> = {
  group: G;
  content: ChecklistContent[G] | undefined;
  /** The group version on screen. */
  version: number;
  stored: ChecklistInput[G];
  storedUnits: Map<string, UnitValue>;
  /** The body the next save sends: the stored input plus the edits (A-4). */
  input: ChecklistInput[G];
  units: Map<string, UnitValue>;
  metas: Map<string, ChecklistUnitMeta>;
  edits: GroupEdits;
  created: readonly string[];
  /** The draft was typed on an older version than the screen's: the compare view (spec 6.2). */
  conflict: boolean;
  draftText: string;
  draftVersion: number | null;
  locked: boolean;
  /** Sets one unit; an edit equal to the stored unit is no edit. `created`: an entry the user adds. */
  setUnit(key: string, value: UnitValue, created?: boolean): void;
  /** Sets several units in one change (a list emptied, an entry replaced). */
  setUnits(changes: readonly (readonly [key: string, value: UnitValue, created?: boolean])[]): void;
  /** Replaces the draft (after a rebase): the edits typed on `version`. */
  replaceDraft(version: number, edits: GroupEdits): void;
  clearDraft(submitted?: string): void;
};

export function usePanel<G extends ChecklistGroupPath>(group: G): Panel<G> {
  const page = useChecklistPage();
  const key = checklistDraftKey({ userId: page.userId, leadId: page.leadId, checklistId: page.checklistId, group });
  const [text, setText, clearText] = useDraft(key);
  const draft = useMemo(() => readChecklistDraft(text), [text]);
  const groupView = page.view.groups?.[group];
  const version = groupView?.version ?? 0;
  const content = groupView?.content as ChecklistContent[G] | undefined;
  const { spaces, scope } = page.ctx;
  const ctx = useMemo(() => ({ spaces, scope }), [spaces, scope]);
  const edits = useMemo(() => draft?.edits ?? {}, [draft?.edits]);
  const created = useMemo(() => draft?.created ?? [], [draft?.created]);
  const stored = useMemo(() => inputOfContent(group, content, ctx), [group, content, ctx]);
  const storedUnits = useMemo(() => unitsOfInput(group, stored), [group, stored]);
  const input = useMemo(() => toGroupInput(group, content, edits, ctx), [group, content, edits, ctx]);
  const units = useMemo(() => unitsOfInput(group, input), [group, input]);
  const metas = useMemo(() => metaOfUnits(group, content), [group, content]);
  const draftVersion = draft?.version ?? null;

  const setUnits = useCallback(
    (changes: readonly (readonly [string, UnitValue, boolean?])[]) => {
      const next: GroupEdits = { ...edits };
      let nextCreated = [...created];
      for (const [unitKey, raw, isNew] of changes) {
        const value = withRelayRule(raw, storedUnits.get(unitKey), page.userId);
        if (storedUnits.has(unitKey) && sameUnit(storedUnits.get(unitKey), value)) delete next[unitKey];
        else if (!storedUnits.has(unitKey) && value === null && nextCreated.includes(unitKey)) {
          delete next[unitKey];
          nextCreated = nextCreated.filter((key) => key !== unitKey);
        } else next[unitKey] = value;
        if (isNew && !nextCreated.includes(unitKey)) nextCreated.push(unitKey);
      }
      setText(writeChecklistDraft(draftVersion ?? version, next, nextCreated));
    },
    [edits, storedUnits, created, draftVersion, version, setText, page.userId],
  );
  const setUnit = useCallback(
    (unitKey: string, value: UnitValue, isNew = false) => setUnits([[unitKey, value, isNew]]),
    [setUnits],
  );

  const replaceDraft = useCallback(
    (nextVersion: number, nextEdits: GroupEdits) => setText(writeChecklistDraft(nextVersion, nextEdits, created)),
    [created, setText],
  );

  return {
    group,
    content,
    version,
    stored,
    storedUnits,
    input,
    units,
    metas,
    edits,
    created,
    conflict: draftVersion !== null && draftVersion !== version,
    draftText: text,
    draftVersion,
    locked: isPanelLocked(page.locks, group),
    setUnit,
    setUnits,
    replaceDraft,
    clearDraft: clearText,
  };
}
