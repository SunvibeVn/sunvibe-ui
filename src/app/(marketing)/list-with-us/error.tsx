"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Error boundary of /list-with-us only; the marketing home page keeps its own behavior. */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("OwnerIntake.page.error");
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-16 sm:px-6">
      <Alert tone="error" title={t("title")}>
        {t("message")}
      </Alert>
      <Button variant="secondary" onClick={retry}>
        {t("retry")}
      </Button>
    </div>
  );
}
