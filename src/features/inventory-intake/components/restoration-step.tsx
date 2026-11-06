"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { restoreIntake } from "../services/intake-api";

import { COMMAND_IDLE, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { StepCard } from "./step-card";

/** Brings back a result whose owner has confirmed again, with its owner check done (spec 4.11). */
export function RestorationStep() {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, busy } = useIntake();
  const run = useIntakeCommand();

  const [state, dispatch, pending] = useActionState(
    () => run(() => restoreIntake(leadId, { expectedVersion: block.version ?? undefined }), apply),
    COMMAND_IDLE,
  );
  useIntakeLock("restoration", pending);

  return (
    <StepCard title={t("restoration.title")}>
      <form action={dispatch} className="space-y-3">
        {state.message !== null && <IntakeMessage value={state.message} />}
        <p className="text-sm text-slate-700">{t("restoration.intro")}</p>
        <Button type="submit" pending={pending} disabled={busy}>
          {pending ? t("restoration.saving") : t("restoration.submit")}
        </Button>
      </form>
    </StepCard>
  );
}
