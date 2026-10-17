"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../session/use-session";
import {
  type SignedInLoad,
  type SignedInLoadView,
  type SignedInRedirect,
  applySignedInLoad,
  signedInLoadView,
} from "./signed-in-load";

const noRedirect = () => {};

/**
 * Runs `loader` once mounted and again on `retry`, and says what the page shows (see `signedInLoadView`). `loader` and
 * `onRedirect` must be stable (module functions or `useCallback`). A redirect answer is passed to `onRedirect` only
 * while the content is still mounted, and keeps the loading view.
 */
export function useSignedInLoad<L extends SignedInLoad>(
  loader: () => Promise<L | SignedInRedirect>,
  onRedirect: (to: string) => void = noRedirect,
): { view: SignedInLoadView<L>; retry(): void } {
  const { status } = useSession();
  const [load, setLoad] = useState<L | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void loader().then((result) =>
      applySignedInLoad<L>(result, { isActive: () => active, setLoad, redirect: onRedirect }),
    );
    return () => {
      active = false;
    };
  }, [attempt, loader, onRedirect]);

  const retry = useCallback(() => {
    setLoad(null);
    setAttempt((value) => value + 1);
  }, []);

  return { view: signedInLoadView(load, status), retry };
}
