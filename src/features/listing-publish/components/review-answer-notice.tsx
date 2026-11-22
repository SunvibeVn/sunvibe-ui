"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";

import type { ListingKey } from "../lib/revision-text";

/**
 * The sentence of a decision's answer (spec section 6, E06S4-P13), with the reasons of a 403
 * `REVIEWER_NOT_INDEPENDENT` under it, one sentence each. Shown by the form while it is there, and by the page when the
 * answer removed the form.
 */
export function ReviewAnswerNotice({ messageKey, reasonKeys = [] }: { messageKey: ListingKey; reasonKeys?: readonly ListingKey[] }) {
  const t = useTranslations("ListingPublish");
  return (
    <Alert tone="error">
      <p>{t(messageKey)}</p>
      {reasonKeys.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {reasonKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
