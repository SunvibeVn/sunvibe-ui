"use client";

import { useTranslations } from "next-intl";

import { SiteErrorPanel } from "@/components/layout/site-error-panel";

/**
 * Error boundary of the marketing group's pages, the home page included (marketing-landing SV-250, EP-5). It renders
 * inside the marketing layout, so the site header and footer stay. Vietnamese: every path of the group is public.
 * /list-with-us keeps its own nearer boundary. The thrown error is never shown.
 */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("SiteError");
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <SiteErrorPanel
        texts={{ title: t("title"), message: t("message"), retry: t("retry"), home: t("home") }}
        retry={retry}
        lang="vi"
      />
    </div>
  );
}
