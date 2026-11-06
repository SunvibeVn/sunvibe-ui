"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { decisionPanelModel, type RequalificationModel } from "../../lib/checklist/status-model";

import { useChecklistMedia } from "./media-context";
import type { ChainLoad } from "./use-revision-chain";

/** Why an earlier pass was withdrawn from use: where the next reviewer reads the mark (property-create requalification 4). */
function EarlierRequalification({ mark }: { mark: RequalificationModel }) {
  const t = useTranslations("OwnerLeads");
  return (
    <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2">
      <p className="break-words font-medium text-slate-900">
        {t("checklist.review.earlier.requalified", { kind: mark.kind, name: mark.markedBy, when: mark.markedAt })}
      </p>
      <p className="whitespace-pre-wrap break-words text-slate-700">{t("checklist.review.earlier.reason", { text: mark.reason })}</p>
      <p className="whitespace-pre-wrap break-words text-slate-700">{t("checklist.review.earlier.source", { text: mark.source })}</p>
      <p className="whitespace-pre-wrap break-words text-slate-700">{t("checklist.review.earlier.scope", { text: mark.scope })}</p>
      <p className="text-slate-700">{t("checklist.review.earlier.basisDate", { date: mark.basisDate })}</p>
    </div>
  );
}

/**
 * The decisions on the earlier revisions of the chain, with their reasons (survey-checklist submission spec 6.1): what
 * the Sale was asked before this submission. Newest first.
 */
export function EarlierDecisions({ chain, onRetry }: { chain: ChainLoad; onRetry(): void }) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const photoOf = (mediaId: string) => media?.itemOf(mediaId) ?? null;
  const decided =
    chain.state === "ready"
      ? chain.revisions.flatMap((revision) => {
          const model = decisionPanelModel(revision, t, photoOf);
          return model === null ? [] : [{ checklistNo: revision.checklistNo ?? "", id: revision.id ?? "", model }];
        })
      : [];
  return (
    <section aria-labelledby="cl-earlier-title" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id="cl-earlier-title" className="text-base font-semibold text-slate-900">
        {t("checklist.review.earlier.title")}
      </h2>
      {chain.state === "loading" ? (
        <p role="status" className="text-sm text-slate-600">
          {t("checklist.review.earlier.loading")}
        </p>
      ) : (
        <>
          {decided.length === 0 && chain.complete && <p className="text-sm text-slate-600">{t("checklist.review.earlier.none")}</p>}
          {decided.length > 0 && (
            <ul className="space-y-3 text-sm">
              {decided.map(({ id, checklistNo, model }) => (
                <li key={id} className="space-y-0.5 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="break-words font-medium text-slate-900">
                    {t("checklist.review.earlier.line", { no: checklistNo, outcome: model.outcome, name: model.reviewer, when: model.when })}
                  </p>
                  {model.reason !== null && (
                    <p className="whitespace-pre-wrap break-words text-slate-700">{t("checklist.review.earlier.reason", { text: model.reason })}</p>
                  )}
                  {model.notes !== null && (
                    <p className="whitespace-pre-wrap break-words text-slate-700">{t("checklist.review.earlier.notes", { text: model.notes })}</p>
                  )}
                  {model.limitations !== null && (
                    <p className="whitespace-pre-wrap break-words text-slate-700">
                      {t("checklist.review.earlier.limitations", { text: model.limitations })}
                    </p>
                  )}
                  {model.marks.map((mark) => (
                    <p key={mark.mediaId} className="break-words text-slate-700">
                      {t("checklist.decision.mark", { photo: mark.photo, reason: mark.reason })}
                    </p>
                  ))}
                  {model.requalification !== null && <EarlierRequalification mark={model.requalification} />}
                </li>
              ))}
            </ul>
          )}
          {!chain.complete && (
            <div className="space-y-2">
              <Alert tone="error">{t("checklist.review.earlier.failed")}</Alert>
              <Button variant="secondary" onClick={onRetry}>
                {t("checklist.review.earlier.retry")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
