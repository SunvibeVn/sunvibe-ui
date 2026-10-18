"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import type { TerritoryProblem } from "../lib/territory-flags";
import type { Territory } from "../types";

import { ProblemAlert } from "./territory-problem";

type TerritoryRemoveDialogProps = {
  territory: Territory;
  busy: boolean;
  problem: TerritoryProblem | null;
  onConfirm(): Promise<void>;
  onClose(): void;
};

/** "Bỏ gán": a confirmation naming the holder and the ward (US-8 AC-2). */
export function TerritoryRemoveDialog({ territory, busy, problem, onConfirm, onClose }: TerritoryRemoveDialogProps) {
  const t = useTranslations("SaleTerritories");
  const holder = territory.userName?.trim() ? territory.userName : t("holder.unknown");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("removeDialog.title")}
      closeLabel={busy ? undefined : t("removeDialog.cancel")}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("removeDialog.cancel")}
          </Button>
          <Button pending={busy} onClick={() => void onConfirm()}>
            {busy ? t("removeDialog.submitting") : t("removeDialog.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {problem !== null && <ProblemAlert problem={problem} />}
        <p>{t("removeDialog.body", { holder, ward: territory.wardName ?? "" })}</p>
      </div>
    </Dialog>
  );
}
