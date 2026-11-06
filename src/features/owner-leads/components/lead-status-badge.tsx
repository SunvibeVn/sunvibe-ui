"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { statusLabelKey } from "@/features/lead-shared";

const TONE: Record<string, BadgeTone> = {
  NEW: "neutral",
  ASSIGNED: "info",
  CONTACTED: "success",
  SURVEY_SCHEDULED: "info",
  QUALIFIED: "success",
  ON_HOLD: "warning",
  DUPLICATE: "neutral",
  REJECTED: "neutral",
  WITHDRAWN: "neutral",
};

/** Status of a lead as a badge. Any status the workspace does not know shows a generic label (never the raw code). */
export function LeadStatusBadge({ status }: { status: string | undefined }) {
  const t = useTranslations("OwnerLeads");
  const tone = status !== undefined && Object.hasOwn(TONE, status) ? TONE[status] : "neutral";
  return <Badge tone={tone}>{t(statusLabelKey(status))}</Badge>;
}
