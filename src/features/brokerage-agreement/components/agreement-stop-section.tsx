"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";

import type { StopModel } from "../lib/stop-model";
import { phraseText } from "../lib/version-terms-model";

import { CancellationDialog } from "./cancellation-dialog";
import { SuspensionDialog } from "./suspension-dialog";
import { SuspensionReleaseDialog } from "./suspension-release-dialog";
import { TerminationDialog } from "./termination-dialog";

type AgreementStopSectionProps = {
  agreementId: string;
  /** The data version the page read; the release and the cancellation send it back, so neither is offered without it. */
  dataVersion: number | null;
  model: StopModel;
  /** A 204 of a stop: the page reads the agreement again. */
  onDone: () => void;
  /** A refused stop (403 or a 409 other than a change at the same time): the page reads again and shows the code. */
  onChanged: (code: string) => void;
  /** "Reload" after a change made at the same time: the page reads the agreement again. */
  onReload: () => void;
};

type OpenDialog = "suspend" | "release" | "terminate" | "cancel" | null;

/**
 * "Agreement state" on the staff page (brokerage-agreement E05-S8, spec section 6, US-5 AC-2, AC-5, US-1 AC-5): how the
 * agreement ended and each suspension record, newest first, as text (private values, BR-17: never markup), then the
 * buttons of the stops the viewer may take now, each opening its dialog. The buttons follow the server's hint
 * (`viewerStopActions`); the server decides each command. The section makes no call of its own on mount: it is a part
 * of the detail and loads, fails and reloads with it.
 */
export function AgreementStopSection({ agreementId, dataVersion, model, onDone, onChanged, onReload }: AgreementStopSectionProps) {
  const t = useTranslations("BrokerageAgreement");
  const titleId = useId();
  const [open, setOpen] = useState<OpenDialog>(null);

  const { lines, earlier, actions } = model;
  const close = () => setOpen(null);
  const handlers = {
    onClose: close,
    onDone: () => {
      close();
      onDone();
    },
    onChanged: (code: string) => {
      close();
      onChanged(code);
    },
    onReload: () => {
      close();
      onReload();
    },
  };
  const release = actions.release && dataVersion !== null;
  const cancel = actions.cancel && dataVersion !== null;
  const terminate = actions.terminateTypes.length > 0;
  const anyAction = actions.suspend || release || terminate || cancel;

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={titleId} className="text-base font-semibold text-slate-900">
        {t("stop.title")}
      </h2>
      {lines.length > 0 && (
        <ul className="space-y-2 text-sm">
          {lines.map((line, index) => (
            <li key={`${index}:${line.phrase.key}`} className="space-y-0.5">
              <p className="break-words text-slate-900">{phraseText(t, line.phrase)}</p>
              {line.note !== null && <p className="whitespace-pre-line break-words text-slate-700">{t("stop.note", { note: line.note })}</p>}
            </li>
          ))}
        </ul>
      )}
      {earlier && <p className="text-sm text-slate-600">{t("stop.earlier")}</p>}
      {anyAction && (
        <div className="flex flex-wrap gap-2">
          {actions.suspend && (
            <Button variant="secondary" className="px-4 py-2" onClick={() => setOpen("suspend")}>
              {t("stop.actions.suspend")}
            </Button>
          )}
          {release && (
            <Button variant="secondary" className="px-4 py-2" onClick={() => setOpen("release")}>
              {t("stop.actions.release")}
            </Button>
          )}
          {terminate && (
            <Button variant="secondary" className="px-4 py-2" onClick={() => setOpen("terminate")}>
              {t("stop.actions.terminate")}
            </Button>
          )}
          {cancel && (
            <Button variant="secondary" className="px-4 py-2" onClick={() => setOpen("cancel")}>
              {t("stop.actions.cancel")}
            </Button>
          )}
        </div>
      )}
      {open === "suspend" && actions.suspend && <SuspensionDialog agreementId={agreementId} {...handlers} />}
      {open === "release" && release && dataVersion !== null && (
        <SuspensionReleaseDialog agreementId={agreementId} dataVersion={dataVersion} {...handlers} />
      )}
      {open === "terminate" && terminate && <TerminationDialog agreementId={agreementId} types={actions.terminateTypes} {...handlers} />}
      {open === "cancel" && cancel && dataVersion !== null && (
        <CancellationDialog agreementId={agreementId} dataVersion={dataVersion} {...handlers} />
      )}
    </section>
  );
}
