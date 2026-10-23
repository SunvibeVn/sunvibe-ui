"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CopyIcon } from "@/components/icons";
import { copyText } from "@/lib/utils/copy-text";

/** How long "Copied." stays next to the button. */
const SHOWN_MS = 2000;

/**
 * A contact value as plain text with a copy button next to it (owner 2026-10-23, D-7: no `tel:` or `mailto:` link).
 * A refused or missing clipboard says so; the text stays on screen to copy by hand.
 */
export function CopyValue({ value, label, breakAll = false }: { value: string; label: string; breakAll?: boolean }) {
  const t = useTranslations("OwnerLeads.detail.contact");
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (result === null) return;
    const timer = setTimeout(() => setResult(null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [result]);

  return (
    <>
      {/* The button stays right of the value, also when a long e-mail wraps. */}
      <span className="flex items-start gap-2">
        <span className={`min-w-0 ${breakAll ? "break-all" : "break-words"}`}>{value}</span>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => {
            // Cleared first, so a second copy shows (and announces) the result again and restarts its timer.
            setResult(null);
            void copyText(value, navigator.clipboard).then(setResult);
          }}
          className="-my-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          <CopyIcon size={16} />
        </button>
      </span>
      {/* Below the value, so a longer message never squeezes it; empty, it takes no room. */}
      <span role="status" className={`block text-xs ${result === "failed" ? "text-rose-600" : "text-emerald-700"}`}>
        {result === "copied" ? t("copied") : result === "failed" ? t("copyFailed") : ""}
      </span>
    </>
  );
}
