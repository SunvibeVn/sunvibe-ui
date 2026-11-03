"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { MediaCategory } from "@/features/surveys";

/** "<placement> · <category>" of a photo pair: "Asset (whole property) · Exterior and access", "Space P101 · Kitchen". */
export function usePairText(): (spaceCode: string | null, category: MediaCategory) => string {
  const t = useTranslations("OwnerLeads");
  return useCallback(
    (spaceCode, category) =>
      t("checklist.media.pair", {
        placement: spaceCode === null ? t("checklist.media.placement.asset") : t("checklist.media.placement.space", { code: spaceCode }),
        category: t(`checklist.media.categories.${category}`),
      }),
    [t],
  );
}
