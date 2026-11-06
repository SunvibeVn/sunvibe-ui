"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { englishSessionTexts, RequireSession, useSession } from "@/features/auth/client";

import { type ConfirmationItemView, type ConfirmationMessage as Message, confirmationItems } from "../lib/confirmation-flow";
import type { IntakeKey } from "../lib/labels";
import { viewAfterFailedRead } from "../lib/read-view";
import { listConfirmations, toConfirmationUiError } from "../services/confirmations-api";

import { ConfirmationConfirmedItem } from "./confirmation-confirmed-item";
import { ConfirmationMessage } from "./confirmation-message";
import { ConfirmationPendingItem, type ItemActions } from "./confirmation-pending-item";
import { usePageHide } from "./use-page-hide";

const ACCOUNT_PATH = "/account";

/** `/account/property-confirmations` (spec 6.2): client state only, so a reload starts over and nothing stays in the tab. */
export function PropertyConfirmationsSection() {
  return (
    <RequireSession texts={englishSessionTexts}>
      <ForUser />
    </RequireSession>
  );
}

/** Starts over for another signed-in user: nothing typed for one account reaches the next one. */
function ForUser() {
  const { user } = useSession();
  return <ConfirmationList key={user?.userId ?? ""} />;
}

type ListView = { kind: "ready"; items: ConfirmationItemView[] } | { kind: "error"; correlationId?: string };

function ConfirmationList() {
  const t = useTranslations("InventoryIntake");
  const [view, setView] = useState<ListView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<IntakeKey | null>(null);
  const [moved, setMoved] = useState<Message | null>(null);
  /** False once this account's view is gone: a late answer is dropped (auth U-8). */
  const live = useRef(false);
  /** Number of the newest read; an older answer is dropped. */
  const newest = useRef(0);

  /** False only when the read failed: an answer dropped for a newer read, or left to the session screens, is not a failure. */
  const load = useCallback((): Promise<boolean> => {
    const mine = ++newest.current;
    return listConfirmations().then((result) => {
      if (!live.current || mine !== newest.current) return true;
      if (result.ok) {
        setView({ kind: "ready", items: confirmationItems(result.data) });
        return true;
      }
      const error = toConfirmationUiError(result);
      if (error?.kind === "signed-out" || error?.kind === "unavailable") return true;
      const failed: ListView = error?.correlationId === undefined ? { kind: "error" } : { kind: "error", correlationId: error.correlationId };
      setView((previous) => viewAfterFailedRead(previous, failed));
      return false;
    });
  }, []);

  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      // Next keeps this route hidden (Activity): nothing of the requests stays in it.
      setView(null);
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load, attempt]);

  // The manager starts the check while this page is open: coming back to it reads whether a phrase is asked for now, and a
  // page restored from the browser's Back cache reads what it forgot.
  useEffect(() => {
    const readAgain = () => {
      if (document.visibilityState === "visible") void load();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) void load();
    };
    document.addEventListener("visibilitychange", readAgain);
    window.addEventListener("pageshow", restored);
    return () => {
      document.removeEventListener("visibilitychange", readAgain);
      window.removeEventListener("pageshow", restored);
    };
  }, [load]);

  const forget = useCallback(() => setView(null), []);
  usePageHide(forget);

  const actions: ItemActions = useMemo(
    () => ({
      isCurrent: () => live.current,
      reload: load,
      onMoved: (message) => {
        setDone(null);
        setMoved(message);
      },
      onDone: (key) => {
        setMoved(null);
        setDone(key);
        // What was on screen is over: a read that fails now must not leave its address behind.
        setView(null);
      },
    }),
    [load],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold text-navy-950">{t("account.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("account.intro")}</p>
      </section>
      <div aria-live="polite" className="space-y-3">
        {done !== null && <Alert tone="success">{t(done)}</Alert>}
        {moved !== null && <ConfirmationMessage value={moved} />}
      </div>
      {view === null && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("account.loading")}</span>
          <div aria-hidden className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-slate-100" />
        </div>
      )}
      {view?.kind === "error" && (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("account.loadFailed")}</p>
            {view.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("account.errors.supportCode", { correlationId: view.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            {t("account.retry")}
          </Button>
        </div>
      )}
      {view?.kind === "ready" && view.items.length === 0 && <p className="text-sm text-slate-600">{t("account.empty")}</p>}
      {view?.kind === "ready" && view.items.length > 0 && (
        <ul className="space-y-4">
          {view.items.map((item) =>
            item.kind === "pending" ? (
              <ConfirmationPendingItem key={item.requestId} item={item} actions={actions} />
            ) : (
              <ConfirmationConfirmedItem key={item.requestId} item={item} actions={actions} />
            ),
          )}
        </ul>
      )}
      <p className="text-center text-sm">
        <Link href={ACCOUNT_PATH} prefetch={false} className="font-semibold text-violet-700 hover:text-violet-800">
          {t("account.back")}
        </Link>
      </p>
    </div>
  );
}
