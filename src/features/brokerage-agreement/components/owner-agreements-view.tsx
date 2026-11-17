"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type ApiResult, englishSessionTexts, RequireSession, useSession } from "@/features/auth/client";

import { ownerAgreementsModel } from "../lib/owner-agreements-model";
import { canTickMore, tick, untick, type VersionKey } from "../lib/owner-confirm-form";
import { listMine } from "../services/owner-agreement-api";
import type { BrokerageAgreementOwnerList } from "../types";

import { OwnerAgreementCard } from "./owner-agreement-card";
import { OwnerConfirmForm } from "./owner-confirm-form";
import { OwnerRejectDialog } from "./owner-reject-dialog";

/**
 * `/account/brokerage-agreements` (brokerage-agreement US-2, S5-D17): the agreements Sunvibe sent the signed-in account,
 * read in the browser only. Client state only, so a reload starts over and nothing stays in the tab.
 */
export function OwnerAgreementsView() {
  return (
    <RequireSession texts={englishSessionTexts}>
      <ForUser />
    </RequireSession>
  );
}

/** Starts over for another signed-in user: nothing ticked or typed for one account reaches the next one. */
function ForUser() {
  const { user } = useSession();
  return <OwnerAgreementList key={user?.userId ?? ""} />;
}

function OwnerAgreementList() {
  const t = useTranslations("BrokerageAgreement");
  const [result, setResult] = useState<ApiResult<BrokerageAgreementOwnerList> | null>(null);
  const [ticked, setTicked] = useState<VersionKey[]>([]);
  const [declining, setDeclining] = useState<VersionKey | null>(null);
  /** "Something changed. The page was reloaded.": shown after an answer that found the page out of date. */
  const [reloaded, setReloaded] = useState(false);
  /** False once this account's view is gone: a late answer is dropped. */
  const live = useRef(false);
  /** Number of the newest read; an older answer is dropped. */
  const newest = useRef(0);

  // Each read writes one access-log row per agreement (brokerage-agreement BR-17), so the page reads only on opening,
  // on "Try again" and after an answer.
  const load = useCallback(() => {
    const mine = ++newest.current;
    void listMine().then((answer) => {
      if (live.current && mine === newest.current) setResult(answer);
    });
  }, []);

  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      // Next keeps this route hidden (Activity): nothing of the agreements stays in it.
      setResult(null);
    };
  }, []);

  // One read on opening, also when a development double effect runs it twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    load();
  }, [load]);

  const model = useMemo(() => ownerAgreementsModel(result), [result]);

  // Only versions the owner may answer now stay ticked: a read that changed a version's state drops it.
  const answerable =
    model.kind === "list"
      ? model.items.flatMap((item) =>
          item.versions.filter((version) => version.answerable).map((version) => ({ agreementId: item.agreementId, version })),
        )
      : [];
  const liveTicked = ticked.filter((key) =>
    answerable.some(({ agreementId, version }) => agreementId === key.agreementId && version.versionNo === key.versionNo),
  );
  const values = { ticked: liveTicked, password: "" };
  const firstTicked = answerable.find(
    ({ agreementId, version }) => liveTicked[0]?.agreementId === agreementId && liveTicked[0]?.versionNo === version.versionNo,
  );
  const unitCodes = new Map(model.kind === "list" ? model.items.map((item) => [item.agreementId, item.unitCode]) : []);

  const retry = () => {
    setResult(null);
    load();
  };
  const readAgain = () => {
    setTicked([]);
    setReloaded(false);
    load();
  };
  const reload = () => {
    setTicked([]);
    setDeclining(null);
    setReloaded(true);
    load();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold text-navy-950">{t("owner.title")}</h1>
      </section>
      <div aria-live="polite">{reloaded && <Alert tone="info">{t("owner.errors.reload")}</Alert>}</div>
      {model.kind === "loading" && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("owner.loading")}</span>
          <div aria-hidden className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-slate-100" />
        </div>
      )}
      {model.kind === "error" && (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("owner.loadFailed")}</p>
            {model.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("owner.supportCode", { correlationId: model.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" onClick={retry}>
            {t("owner.retry")}
          </Button>
        </div>
      )}
      {model.kind === "empty" && <p className="text-sm text-slate-600">{t("owner.empty")}</p>}
      {model.kind === "list" && (
        <>
          <ul className="space-y-4">
            {model.items.map((item, index) => (
              <OwnerAgreementCard
                key={`${index}:${item.agreementId}`}
                agreement={item}
                tickedVersions={liveTicked.filter((key) => key.agreementId === item.agreementId).map((key) => key.versionNo)}
                canTickMore={canTickMore(values)}
                onTick={(versionNo, on) => {
                  const key = { agreementId: item.agreementId, versionNo };
                  setTicked((on ? tick(values, key) : untick(values, key)).ticked);
                }}
                onDecline={(versionNo) => setDeclining({ agreementId: item.agreementId, versionNo })}
              />
            ))}
          </ul>
          {model.more && <p className="text-sm text-slate-600">{t("owner.more")}</p>}
          {liveTicked.length > 0 && (
            <OwnerConfirmForm
              ticked={liveTicked}
              statementVersion={firstTicked?.version.statementVersion ?? null}
              unitCodeOf={(agreementId) => unitCodes.get(agreementId) ?? null}
              onConfirmed={readAgain}
              onReload={reload}
            />
          )}
        </>
      )}
      {declining !== null && (
        <OwnerRejectDialog
          agreementId={declining.agreementId}
          versionNo={declining.versionNo}
          onClose={() => setDeclining(null)}
          onDeclined={() => {
            setDeclining(null);
            readAgain();
          }}
          onReload={reload}
        />
      )}
    </div>
  );
}
