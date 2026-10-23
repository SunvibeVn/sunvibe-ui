"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { copyText } from "@/lib/utils/copy-text";

export type SubmitSuccessProps = {
  requestCode: string;
  /** Shows an empty form again. */
  onRestart: () => void;
};

/** Success screen for a new request and for a replay alike: BR-12 confirmation and the request code. */
export function SubmitSuccess({ requestCode, onRestart }: SubmitSuccessProps) {
  const t = useTranslations("OwnerIntake");
  const [copy, setCopy] = useState<"copied" | "failed" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The form is gone; move the focus to the confirmation so screen readers announce it.
  useEffect(() => heading.current?.focus(), []);

  return (
    <section aria-labelledby="owner-intake-success-title" className="space-y-4">
      <Alert tone="success">
        <h2 id="owner-intake-success-title" ref={heading} tabIndex={-1} className="font-semibold outline-none">
          {t("success.title")}
        </h2>
        <p className="mt-1">{t("success.confirmation")}</p>
      </Alert>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">{t("success.requestCodeLabel")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <output className="select-all rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-lg font-semibold tracking-wider text-slate-900">
            {requestCode}
          </output>
          <Button
            variant="secondary"
            className="px-4 py-1.5"
            onClick={() => void copyText(requestCode, navigator.clipboard).then(setCopy)}
          >
            {t("success.copy")}
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm text-slate-600">
          {copy === "copied" ? t("success.copied") : copy === "failed" ? t("success.copyFailed") : null}
        </p>
      </div>
      <Button variant="ghost" className="px-4 py-1.5" onClick={onRestart}>
        {t("success.sendAnother")}
      </Button>
    </section>
  );
}
