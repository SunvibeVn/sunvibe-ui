import { CHECKLIST_GROUP_PATHS, type ChecklistContent, type ChecklistGroupPath, type ChecklistView } from "@/features/surveys";

import type { DraftKey, DraftStore } from "../drafts";

import { contextOf } from "./correction-rule";
import { inputOfContent, type GroupContext, type GroupEdits, unitsOfInput } from "./group-input";
import { sameUnit } from "./unit-equality";
import { parseUnitKey, spaceIdOfKey } from "./units";

// Checklist drafts (survey-checklist spec 6.2 Drafts): per group, only the units the user changed, with the group
// version they were typed on, in the tab-memory store beside the other workspace drafts (never browser storage), so
// they are dropped on sign-out with them. A resubmit never puts back what someone else changed.

export type ChecklistDraftKey = { userId: string; leadId: string; checklistId: string; group: ChecklistGroupPath };

/** The groups a checklist keeps drafts for (G7 has no content). */
export const CHECKLIST_DRAFT_GROUPS = CHECKLIST_GROUP_PATHS;

/** The key of a checklist group's draft in the shared draft store. */
export function checklistDraftKey({ userId, leadId, checklistId, group }: ChecklistDraftKey): DraftKey {
  return { userId, leadId, form: `checklist:${checklistId}:${group}` };
}

/** Drops the drafts of every group of one checklist (a 404: the checklist is gone or no longer visible, W16-32). */
export function dropChecklistDrafts(
  store: Pick<DraftStore, "clear">,
  key: Omit<ChecklistDraftKey, "group">,
): void {
  for (const group of CHECKLIST_DRAFT_GROUPS) store.clear(checklistDraftKey({ ...key, group }));
}

/** A group's draft: the edits by unit key, the group version they were typed on, and the entries the user created. */
export type ChecklistDraft = { version: number; edits: GroupEdits; created: string[] };

/** The draft text; "" (no draft) when there is no edit. */
export function writeChecklistDraft(version: number, edits: GroupEdits, created: readonly string[]): string {
  if (Object.keys(edits).length === 0) return "";
  return JSON.stringify({ version, edits, created: created.filter((key) => Object.hasOwn(edits, key)) });
}

/** The draft of a text, or null for no draft or an unreadable one. */
export function readChecklistDraft(text: string): ChecklistDraft | null {
  if (text === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { version, edits, created } = parsed as Partial<ChecklistDraft>;
  if (typeof version !== "number" || typeof edits !== "object" || edits === null || Array.isArray(edits)) return null;
  const keys = Array.isArray(created) ? created.filter((key): key is string => typeof key === "string") : [];
  return { version, edits, created: keys };
}

/** True when the scope of `ctx` no longer allows this edit (spec 4.6, A-12, A-18). */
function scopeRefuses(key: string, value: unknown, ctx: GroupContext): boolean {
  const parsed = parseUnitKey(key);
  if (parsed === null) return true;
  if (parsed.kind === "override") return ctx.scope !== "PARTS";
  if (parsed.kind === "field" && parsed.group === "condition") return ctx.scope !== "PARTS";
  if (parsed.kind === "spaceField" && parsed.field === "spaceFees") return ctx.scope !== "PARTS";
  if (parsed.kind === "spaceField" && (parsed.field === "monthlyRent" || parsed.field === "availableFrom")) {
    return ctx.scope !== "WHOLE" && (value as { source?: unknown } | null)?.source === "OWNER_FORM";
  }
  return false;
}

const ENTRY_KINDS = new Set(["space", "hazard", "sharedItem", "spaceItem", "otherItem"]);

/**
 * The edit of a saved hazard whose draft space G1 removed: placed where the server keeps the hazard now (at asset level
 * when its stored space was removed, A-12; its own space when that space stays).
 */
function detachSavedHazard(parsed: ReturnType<typeof parseUnitKey>, value: unknown, saved: unknown, ctx: GroupContext): unknown {
  if (parsed?.kind !== "hazard" || saved === undefined || saved === null || value === null || typeof value !== "object") {
    return value;
  }
  const spaceId = (value as { spaceId?: unknown }).spaceId;
  if (typeof spaceId !== "string" || ctx.spaces.includes(spaceId)) return value;
  return { ...value, spaceId: (saved as { spaceId?: string | null }).spaceId ?? null };
}

/**
 * The draft over newer content (after a 409, a G1 removal or a scope switch): edits of units that no longer exist, of
 * a space G1 no longer has, or that the scope no longer allows are dropped and named in `dropped` ("Not kept: ...");
 * edits the newer content already holds are dropped silently.
 */
export function rebaseDraft<G extends ChecklistGroupPath>(
  draft: ChecklistDraft,
  group: G,
  content: ChecklistContent[G] | undefined,
  ctx: GroupContext,
): { edits: GroupEdits; dropped: string[] } {
  const stored = unitsOfInput(group, inputOfContent(group, content, ctx));
  const created = new Set(draft.created);
  const edits: GroupEdits = {};
  const dropped: string[] = [];
  for (const [key, typed] of Object.entries(draft.edits)) {
    if (!key.startsWith(`${group}/`)) continue;
    const parsed = parseUnitKey(key);
    // A saved hazard of a space G1 no longer has stays, detached at asset level (A-12): its edits follow it there.
    const value = detachSavedHazard(parsed, typed, stored.get(key), ctx);
    const spaceId = spaceIdOfKey(key);
    const isEntry = parsed !== null && ENTRY_KINDS.has(parsed.kind);
    const exists = stored.has(key);
    if (isEntry && value === null && !exists) continue;
    const goneSpace = spaceId !== null && !(parsed?.kind === "space" ? exists || created.has(key) : ctx.spaces.includes(spaceId));
    const goneEntry = isEntry && !exists && !created.has(key);
    const itemSpace = (value as { spaceId?: unknown } | null)?.spaceId;
    // An other item goes with its space (A-12); a never-saved hazard of a removed space is not kept (the server
    // never saw it, so nothing detached it).
    const goneItemSpace =
      (parsed?.kind === "otherItem" || parsed?.kind === "hazard") &&
      typeof itemSpace === "string" &&
      !ctx.spaces.includes(itemSpace);
    if (goneSpace || goneEntry || goneItemSpace || scopeRefuses(key, value, ctx)) {
      dropped.push(key);
      continue;
    }
    if (exists && sameUnit(stored.get(key), value)) continue;
    edits[key] = value;
  }
  return { edits, dropped };
}

/**
 * A draft of another group after the user's G1 removal or scope switch (spec 6.2): rebased on the answer's content.
 * A draft typed on the version the screen showed moves to the answer's version; a draft already older than the screen
 * (an unresolved conflict) keeps its version, so its compare view stays until the user chooses "Save mine on top" or
 * "Discard mine".
 */
export function rebaseAfterCascade<G extends ChecklistGroupPath>(
  draft: ChecklistDraft,
  group: G,
  content: ChecklistContent[G] | undefined,
  ctx: GroupContext,
  screenVersion: number,
  answerVersion: number,
): { draft: ChecklistDraft; dropped: string[] } {
  const rebased = rebaseDraft(draft, group, content, ctx);
  const version = draft.version === screenVersion ? answerVersion : draft.version;
  return { draft: { version, edits: rebased.edits, created: draft.created }, dropped: rebased.dropped };
}

/**
 * The other groups' drafts after the user's G1 save removed a space or switched the scope (spec 6.2): each rebased on
 * the answer with `rebaseAfterCascade` against the newest version any of `screens` showed (the screen when the save
 * was sent and when its answer arrived), so a conflict that appeared meanwhile stays. Returns the dropped edits per
 * group ("Not kept: ...").
 */
export function rebaseOtherDrafts(
  store: Pick<DraftStore, "get" | "set">,
  keyOf: (group: ChecklistGroupPath) => DraftKey,
  screens: readonly (ChecklistView | null)[],
  answer: ChecklistView,
): Partial<Record<ChecklistGroupPath, string[]>> {
  const ctx = contextOf(answer);
  const dropped: Partial<Record<ChecklistGroupPath, string[]>> = {};
  for (const group of CHECKLIST_GROUP_PATHS) {
    if (group === "identification") continue;
    const key = keyOf(group);
    const draft = readChecklistDraft(store.get(key) ?? "");
    if (draft === null) continue;
    const rebased = rebaseAfterCascade(
      draft,
      group,
      answer.groups?.[group]?.content as never,
      ctx,
      Math.max(0, ...screens.map((screen) => screen?.groups?.[group]?.version ?? 0)),
      answer.groups?.[group]?.version ?? draft.version,
    );
    store.set(key, writeChecklistDraft(rebased.draft.version, rebased.draft.edits, rebased.draft.created));
    if (rebased.dropped.length > 0) dropped[group] = rebased.dropped;
  }
  return dropped;
}
