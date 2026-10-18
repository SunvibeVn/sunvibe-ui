"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** An unexpected error inside the workspace. The text never carries the error or any lead data. */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Workspace.error");
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16">
      <Alert tone="error" title={t("title")}>
        {t("message")}
      </Alert>
      <Button variant="secondary" onClick={retry}>
        {t("retry")}
      </Button>
    </div>
  );
}
