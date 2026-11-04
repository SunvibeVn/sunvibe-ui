"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { getChecklist } from "@/features/surveys";

import { loadChain, type RevisionChain } from "../../lib/checklist/review-model";

export type ChainLoad = { state: "loading" } | ({ state: "ready" } & RevisionChain);

/**
 * The revisions before `firstId`, for the earlier decisions of the Review tab (survey-checklist submission spec 6.1).
 * Held by the page, so a switch of tab reads nothing again: each read writes the server's access log. Starts only while
 * `enabled`, stops with its screen, and is forgotten when Next hides the route.
 */
export function useRevisionChain({
  userId,
  firstId,
  enabled,
}: {
  userId: string | null;
  firstId: string | null;
  enabled: boolean;
}): { chain: ChainLoad; retry(): void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${firstId}:${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; chain: RevisionChain } | null>(null);
  const done = loaded !== null && loaded.key === key;
  useEffect(() => {
    if (!enabled || done) return;
    let cancelled = false;
    void loadChain(
      firstId,
      async (id) => {
        const result = await getChecklist(id);
        return result.ok ? result.data : null;
      },
      { stopped: () => cancelled },
    ).then((chain) => {
      if (!cancelled) setLoaded({ key, chain });
    });
    return () => {
      cancelled = true;
    };
  }, [firstId, key, enabled, done]);
  useLayoutEffect(() => () => setLoaded(null), []);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { chain: done ? { state: "ready", ...loaded.chain } : { state: "loading" }, retry };
}
