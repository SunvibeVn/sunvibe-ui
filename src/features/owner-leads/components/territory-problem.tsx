"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { ForbiddenNotice } from "@/features/auth/client";

import type { TerritoryProblem } from "../lib/territory-flags";

/** The support code in small text under a message (ADR-010); nothing without one. */
export function SupportCode({ correlationId }: { correlationId: string | undefined }) {
  const t = useTranslations("SaleTerritories");
  return correlationId === undefined ? null : (
    <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId })}</p>
  );
}

/** The message of a failed change or removal (spec 5.2), with its support code. */
export function ProblemAlert({ problem }: { problem: TerritoryProblem }) {
  const t = useTranslations("SaleTerritories");
  if (problem.kind === "forbidden") return <ForbiddenNotice />;
  const text =
    problem.kind === "ineligible"
      ? t("errors.ineligibleAssignee")
      : problem.kind === "bad-request"
        ? t("errors.badRequest")
        : problem.kind === "field"
          ? t("errors.userIdInvalid")
          : t("errors.generic");
  return (
    <Alert tone="error">
      <p>{text}</p>
      <SupportCode correlationId={problem.correlationId} />
    </Alert>
  );
}
