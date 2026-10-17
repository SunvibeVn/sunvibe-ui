"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

/** The inline notice for a business 403 inside a page (an action the user may not take); the session stays. */
export function ForbiddenNotice() {
  const t = useTranslations("Session");
  return <Alert tone="error">{t("forbiddenNotice")}</Alert>;
}
