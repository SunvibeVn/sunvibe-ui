"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { agreementAfter, type AgreementModel } from "../lib/agreement-model";
import { getAgreement } from "../services/agreement-api";

import { AgreementVersionList } from "./agreement-version-list";
import { DraftEditForm } from "./draft-edit-form";
import { DraftSendDialog } from "./draft-send-dialog";

const LOADING: AgreementModel = { kind: "loading" };

/**
 * The workspace page of one brokerage agreement (brokerage-agreement US-4 AC-3 part, S2-D14): its state, transaction
 * type, unit, creation time and versions with their content, and a way back to its basis lead. No owner, intake,
 * property or person (BR-17). The assigned Sale edits the draft in place (E05-S3, S3-D18): "Edit the draft" shows the
 * form and the survey reference instead of the draft's content. Beside it, "Send to the owner" (E05-S4, S4-D14) asks
 * for a confirmation and sends the draft with the data version the page read. Every read is one opening that the
 * server logs (S2-D9): one on mount, one per "Try again", one after a save, a send or a "Reload".
 */
export function AgreementDetailView({ agreementId }: { agreementId: string }) {
  const t = useTranslations("BrokerageAgreement");
  const format = useFormatter();
  const [model, setModel] = useState<AgreementModel>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const versionsId = useId();

  useEffect(() => {
    let dropped = false;
    void getAgreement(agreementId).then((result) => {
      if (!dropped) setModel(agreementAfter(result));
    });
    return () => {
      dropped = true;
    };
  }, [agreementId, attempt]);

  // Next keeps this route hidden (Activity): nothing of the agreement stays in it, the edit form and its values
  // included, and the next read starts as the first.
  useLayoutEffect(
    () => () => {
      setModel(LOADING);
      setEditing(false);
      setConfirmingSend(false);
    },
    [],
  );

  const retry = () => {
    setModel(LOADING);
    setAttempt((count) => count + 1);
  };
  // A saved or sent draft, or a "Reload": leave edit mode, close the send dialog and read the agreement again.
  const reread = () => {
    setEditing(false);
    setConfirmingSend(false);
    retry();
  };

  switch (model.kind) {
    case "session":
      return null;
    case "loading":
      return (
        <p role="status" className="text-sm text-slate-500">
          {t("detail.loading")}
        </p>
      );
    case "not-found":
      return (
        <Alert tone="info">
          <p>{t("detail.notFound")}</p>
        </Alert>
      );
    case "error":
      return (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("detail.loadFailed")}</p>
            {model.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("detail.supportCode", { correlationId: model.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" onClick={retry}>
            {t("detail.retry")}
          </Button>
        </div>
      );
    case "ready": {
      const { agreement, versions, canEditDraft, draft, dataVersion } = model;
      const draftEditor =
        editing && canEditDraft && draft !== null && dataVersion !== null
          ? {
              versionNo: draft.versionNo ?? 0,
              node: (
                <DraftEditForm
                  agreementId={agreementId}
                  dataVersion={dataVersion}
                  version={draft}
                  onSaved={reread}
                  onCancel={() => setEditing(false)}
                  onReload={reread}
                />
              ),
            }
          : undefined;
      return (
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h1 className="text-xl font-semibold text-slate-900">{t("detail.title")}</h1>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("detail.status")}</dt>
                <dd className="font-semibold text-slate-900">{t(agreement.statusKey)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("detail.transactionType")}</dt>
                <dd className="text-slate-900">{t(agreement.transactionTypeKey)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("detail.unit")}</dt>
                <dd className="break-words text-slate-900">{agreement.unitCode ?? t("detail.noCode")}</dd>
              </div>
              {agreement.createdAt !== null && (
                <div>
                  <dt className="text-slate-500">{t("detail.createdAt")}</dt>
                  <dd className="text-slate-900">
                    {format.dateTime(new Date(agreement.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </dd>
                </div>
              )}
            </dl>
            {agreement.leadPath !== null && (
              <Link
                href={agreement.leadPath}
                prefetch={false}
                className="inline-flex text-sm font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {t("detail.openLead")}
              </Link>
            )}
          </div>
          <section
            aria-labelledby={versionsId}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={versionsId} className="text-base font-semibold text-slate-900">
                {t("detail.versions")}
              </h2>
              {canEditDraft && draftEditor === undefined && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="px-4 py-2" onClick={() => setEditing(true)}>
                    {t("edit.open")}
                  </Button>
                  <Button className="px-4 py-2" onClick={() => setConfirmingSend(true)}>
                    {t("send.open")}
                  </Button>
                </div>
              )}
            </div>
            <AgreementVersionList versions={versions} draftEditor={draftEditor} />
          </section>
          {confirmingSend && canEditDraft && draft !== null && dataVersion !== null && draftEditor === undefined && (
            <DraftSendDialog
              agreementId={agreementId}
              versionNo={draft.versionNo ?? 0}
              dataVersion={dataVersion}
              onClose={() => setConfirmingSend(false)}
              onSent={reread}
              onReload={reread}
            />
          )}
        </div>
      );
    }
  }
}
