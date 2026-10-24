"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useSession } from "@/features/auth/client";
import {
  CHECKLIST_GROUP_PATHS,
  type ChecklistGroupPath,
  type ChecklistSaveBody,
  type ChecklistTakeoverInput,
  type ChecklistUiError,
  type ChecklistView,
  getChecklist,
  saveChecklistGroup,
  takeOverChecklist,
  toChecklistUiError,
} from "@/features/surveys";

import { applyAnswer } from "../../lib/checklist/answer-merge";
import { checklistDraftKey, readChecklistDraft, rebaseDraft, writeChecklistDraft } from "../../lib/checklist/checklist-draft";
import { contextOf } from "../../lib/checklist/correction-rule";
import { earlierChecklist, type EarlierChecklist } from "../../lib/checklist/page-notices";
import {
  createAnswerGate,
  forgetChecklist,
  lockAll,
  lockGroup,
  NO_LOCKS,
  pageFailureStep,
  type PanelLocks,
  unlockAll,
  unlockGroup,
} from "../../lib/checklist/page-state";
import { listFlash, tabDrafts, useDraftSessionSync } from "../../lib/drafts";
import { getLeadSurvey } from "../../services/owner-leads-api";
import { LIST_PATH } from "../list-href";

import type { ChecklistPageMessage, CommandOutcome } from "./checklist-context";

export type ChecklistLoad = { state: "loading" } | { state: "ready"; view: ChecklistView } | { state: "error"; error: ChecklistUiError };

/**
 * State and commands of the checklist page (survey-checklist spec 6.2, 6.3): the read in the browser, per-panel and
 * all-panel locks, answers applied only when they are not older than the screen (W16-27), the drafts of other groups
 * rebased after a G1 removal or scope switch, and the page-level outcomes (404 drops the checklist's data and drafts
 * and goes back to the lead list; 403 and read-only reload into read-only).
 */
export function useChecklist(urlLeadId: string, checklistId: string) {
  useDraftSessionSync();
  const { user } = useSession();
  const router = useRouter();
  const userId = user?.userId ?? null;
  const [loaded, setLoaded] = useState<{ userId: string; value: ChecklistLoad } | null>(null);
  const [earlier, setEarlier] = useState<EarlierChecklist | null>(null);
  const [locks, setLocks] = useState<PanelLocks>(NO_LOCKS);
  const [message, setMessage] = useState<ChecklistPageMessage | null>(null);
  const [notKept, setNotKept] = useState<Partial<Record<ChecklistGroupPath, string[]>>>({});
  /** The view on screen, for merging answers that arrive later. */
  const viewRef = useRef<ChecklistView | null>(null);
  const newest = useRef(0);
  const live = useRef(false);
  /** Closed while Next keeps the route hidden: a late answer never puts the checklist back (W16-32). */
  const [gate] = useState(createAnswerGate);

  const showView = useCallback(
    (view: ChecklistView) => {
      if (userId === null || !gate.open()) return;
      viewRef.current = view;
      setLoaded({ userId, value: { state: "ready", view } });
    },
    [userId, gate],
  );

  const leave = useCallback(() => {
    if (userId === null) return;
    newest.current += 1;
    // The checklist is gone for this user (W16-32): its drafts and data go, nothing stays in the hidden route.
    for (const leadId of new Set([urlLeadId, viewRef.current?.leadId ?? urlLeadId])) {
      forgetChecklist(tabDrafts, { userId, leadId, checklistId });
    }
    viewRef.current = null;
    setLoaded(null);
    listFlash.set(userId, "leadNotFound");
    router.replace(LIST_PATH);
  }, [userId, urlLeadId, checklistId, router]);

  const read = useCallback((): Promise<void> => {
    if (userId === null) return Promise.resolve();
    const mine = ++newest.current;
    return getChecklist(checklistId).then((result) => {
      if (mine !== newest.current || !live.current) return;
      const error = toChecklistUiError(result);
      if (error === null && result.ok) {
        showView(result.data);
        return;
      }
      const failure = error ?? { kind: "retry" as const };
      const step = pageFailureStep(failure);
      if (step.kind === "leave") leave();
      else if (step.kind !== "session" && viewRef.current === null) setLoaded({ userId, value: { state: "error", error: failure } });
    });
  }, [userId, checklistId, showView, leave]);

  useEffect(() => {
    if (userId === null) return;
    live.current = true;
    void read();
    return () => {
      live.current = false;
    };
  }, [userId, read]);

  // Next keeps this route hidden (Activity) after navigating away and shows it again on Back: forget what it showed,
  // so a checklist the user can no longer see never shows again while the new read runs (W16-32), and the map of G1
  // mounts fresh (a Leaflet map cannot be shown again in its old container).
  useLayoutEffect(() => {
    gate.show();
    return () => {
      gate.hide();
      newest.current += 1;
      viewRef.current = null;
      setLoaded(null);
      setEarlier(null);
    };
  }, [gate]);

  const view = loaded !== null && loaded.userId === userId && loaded.value.state === "ready" ? loaded.value.view : null;
  const viewLeadId = view?.leadId;

  // The earlier checklist of the cycle, for the starts-empty banner (BR-23): read once per lead.
  useEffect(() => {
    if (userId === null || !viewLeadId) return;
    let cancelled = false;
    void getLeadSurvey(viewLeadId, userId).then((result) => {
      const current = viewRef.current;
      if (cancelled || !result.ok || current === null) return;
      setEarlier(earlierChecklist(result.data ?? {}, current));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, viewLeadId]);

  const merge = useCallback(
    (answer: ChecklistView) => {
      const screen = viewRef.current;
      if (screen === null) {
        showView(answer);
        return;
      }
      const merged = applyAnswer(screen, answer);
      showView(merged.view);
      if (merged.needsReload) void read();
    },
    [showView, read],
  );

  /** After a G1 save that cascaded: each other group's draft is rebased on the new content (spec 6.2). */
  const rebaseOthers = useCallback(
    (answer: ChecklistView) => {
      if (userId === null) return;
      const ctx = contextOf(answer);
      const dropped: Partial<Record<ChecklistGroupPath, string[]>> = {};
      for (const group of CHECKLIST_GROUP_PATHS) {
        if (group === "identification") continue;
        const key = checklistDraftKey({ userId, leadId: answer.leadId ?? urlLeadId, checklistId, group });
        const draft = readChecklistDraft(tabDrafts.get(key) ?? "");
        if (draft === null) continue;
        const rebased = rebaseDraft(draft, group, answer.groups?.[group]?.content as never, ctx);
        const version = answer.groups?.[group]?.version ?? draft.version;
        tabDrafts.set(key, writeChecklistDraft(version, rebased.edits, draft.created));
        if (rebased.dropped.length > 0) dropped[group] = rebased.dropped;
      }
      setNotKept((prev) => ({ ...prev, ...dropped }));
    },
    [userId, urlLeadId, checklistId],
  );

  /** A refusal the page answers itself; true when it was one (the caller only reports failure). */
  const handlePageFailure = useCallback(
    async (error: ChecklistUiError): Promise<boolean> => {
      const step = pageFailureStep(error);
      if (step.kind === "leave") {
        leave();
        return true;
      }
      if (step.kind === "reload") {
        setMessage(step.message);
        await read();
        return true;
      }
      if (error.kind === "surveyor-ineligible") setMessage("surveyorIneligible");
      if (error.kind === "stale") await read();
      return step.kind === "session";
    },
    [leave, read],
  );

  const save = useCallback(
    async <G extends ChecklistGroupPath>(group: G, body: ChecklistSaveBody[G], cascade: boolean): Promise<CommandOutcome> => {
      setLocks((prev) => (cascade ? lockAll(prev) : lockGroup(prev, group)));
      try {
        const result = await saveChecklistGroup(checklistId, group, body);
        const error = toChecklistUiError(result);
        if (error === null && result.ok) {
          setMessage(null);
          if (cascade) rebaseOthers(result.data);
          merge(result.data);
          return { kind: "saved" };
        }
        const failure = error ?? { kind: "retry" as const };
        await handlePageFailure(failure);
        return { kind: "failed", error: failure };
      } finally {
        setLocks((prev) => (cascade ? unlockAll(prev) : unlockGroup(prev, group)));
      }
    },
    [checklistId, merge, rebaseOthers, handlePageFailure],
  );

  const takeOver = useCallback(
    async (input: ChecklistTakeoverInput): Promise<CommandOutcome> => {
      setLocks(lockAll);
      try {
        const result = await takeOverChecklist(checklistId, input);
        const error = toChecklistUiError(result);
        if (error === null && result.ok && result.data.checklist) {
          setMessage(null);
          showView(result.data.checklist);
          return { kind: "saved" };
        }
        const failure = error ?? { kind: "retry" as const };
        if (failure.kind === "stale" || failure.kind === "not-allowed") {
          setMessage(failure.kind === "stale" ? "takeoverStale" : "takeoverNotAllowed");
          await read();
        } else {
          await handlePageFailure(failure);
        }
        return { kind: "failed", error: failure };
      } finally {
        setLocks(unlockAll);
      }
    },
    [checklistId, showView, read, handlePageFailure],
  );

  const clearNotKept = useCallback((group: ChecklistGroupPath) => {
    setNotKept((prev) => {
      if (prev[group] === undefined) return prev;
      const next = { ...prev };
      delete next[group];
      return next;
    });
  }, []);

  const load: ChecklistLoad = loaded !== null && loaded.userId === userId ? loaded.value : { state: "loading" };
  return { userId, load, earlier, locks, message, notKept, clearNotKept, save, takeOver, fail: handlePageFailure, reload: read };
}
