"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

/** The 403 screen: the user is signed in but holds none of the page's roles; the session stays. */
export function Forbidden() {
  const t = useTranslations("Session");
  return (
    <div className="space-y-4 py-6">
      <Alert tone="error" title={t("forbidden.title")}>
        {t("forbidden.body")}
      </Alert>
      <Link href="/" className="text-sm font-semibold text-violet-700 hover:underline">
        {t("forbidden.link")}
      </Link>
    </div>
  );
}
