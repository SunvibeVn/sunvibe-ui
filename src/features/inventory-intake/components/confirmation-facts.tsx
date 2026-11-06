"use client";

import { useTranslations } from "next-intl";

import { ASSET_TYPE_LABEL, labelOf } from "../lib/labels";
import type { OwnerConfirmationSnapshot } from "../types";

import { Fact } from "./step-card";

/** What a request is about: no limitations, notes, terms or contact (spec 4.6 step 3). */
export function ConfirmationFacts({ details }: { details: OwnerConfirmationSnapshot }) {
  const t = useTranslations("InventoryIntake");
  const type = labelOf(ASSET_TYPE_LABEL, details.assetType);
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        {details.leadCode && <Fact label={t("account.lead")}>{details.leadCode}</Fact>}
        {details.wardName && <Fact label={t("account.ward")}>{details.wardName}</Fact>}
        {type !== null && <Fact label={t("account.assetType")}>{t(type)}</Fact>}
        {details.address && <Fact label={t("account.address")}>{details.address}</Fact>}
      </dl>
      {(details.parts ?? []).length > 0 && (
        <div>
          <p className="text-sm text-slate-500">{t("account.parts")}</p>
          <ul className="text-sm text-slate-900">
            {(details.parts ?? []).map((part) => (
              <li key={part.code} className="break-words">
                {[part.code, part.location].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
