"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format/vietnam-time";

import { ASSET_TYPE_LABEL, labelOf, RENTAL_SCOPE_LABEL } from "../lib/labels";
import type { PreviewFieldSource, PreviewView } from "../lib/preview-view";

import { Fact } from "./step-card";

function SourceLine({ item }: { item: PreviewFieldSource }) {
  return (
    <li>
      {[item.field, item.source].filter(Boolean).join(": ")}
      {item.date && ` (${formatDate(item.date)})`}
    </li>
  );
}

/** What the completion will write and what it leaves behind (U-4). Condition and amenities read per unit (D5-20). */
export function PreviewDetails({ view }: { view: PreviewView }) {
  const t = useTranslations("InventoryIntake");
  const none = t("preview.notRecorded");
  const type = labelOf(ASSET_TYPE_LABEL, view.property.assetType);
  const layout = labelOf(RENTAL_SCOPE_LABEL, view.property.layout);

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label={t("preview.owner")}>
          {t(view.owner.confirmed && view.owner.checked ? "preview.ownerConfirmed" : "preview.ownerUnconfirmed")}
        </Fact>
        <Fact label={t("preview.account")}>{view.owner.masked ?? none}</Fact>
        <Fact label={t("preview.code")}>{view.property.code ?? t("preview.codeAtCompletion")}</Fact>
        <Fact label={t("preview.propertyTitle")}>{view.property.title ?? none}</Fact>
        <Fact label={t("preview.assetType")}>{type === null ? none : t(type)}</Fact>
        <Fact label={t("preview.layout")}>{layout === null ? none : t(layout)}</Fact>
        <Fact label={t("preview.address")}>{view.property.address ?? none}</Fact>
        <Fact label={t("preview.ward")}>{view.property.ward ?? none}</Fact>
        {view.source.decidedAt !== null && <Fact label={t("preview.source")}>{formatDateTime(view.source.decidedAt)}</Fact>}
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">{t("preview.units")}</h3>
        {view.units.map((unit) => (
          <div key={unit.spaceCode} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium break-words text-slate-900">
              {unit.spaceCode}
              {" → "}
              {unit.unitCode ?? t("preview.codeAtCompletion")}
            </p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Fact label={t("preview.location")}>{unit.location ?? none}</Fact>
              <Fact label={t("preview.area")}>{unit.areaSqm === null ? none : t("preview.areaValue", { value: unit.areaSqm })}</Fact>
              <Fact label={t("preview.bedrooms")}>{unit.bedrooms ?? none}</Fact>
              <Fact label={t("preview.bathrooms")}>{unit.bathrooms ?? none}</Fact>
              <Fact label={t("preview.condition")}>{unit.condition ?? none}</Fact>
              <Fact label={t("preview.amenities")}>{unit.amenities.length === 0 ? none : unit.amenities.join(", ")}</Fact>
              <Fact label={t("preview.availability")}>{unit.availability === null ? none : t(unit.availability)}</Fact>
            </dl>
            {unit.sources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">{t("preview.sources")}</p>
                <ul className="text-xs text-slate-500">
                  {unit.sources.map((item) => (
                    <SourceLine key={`${item.field}-${item.source}`} item={item} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {view.terms.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("preview.terms")}</h3>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
            {view.terms.map((term) => (
              <li key={`${term.unit}-${term.name}`}>
                {[term.unit, term.name].filter(Boolean).join(" · ")}: {term.value ?? t("preview.noValue")}
                {term.source && <span className="text-xs text-slate-500"> · {term.source}</span>}
                {term.date && <span className="text-xs text-slate-500"> · {formatDate(term.date)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.notCarried.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("preview.notCarried")}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {view.notCarried.map((key) => (
              <Badge key={key}>{t(key)}</Badge>
            ))}
          </div>
        </div>
      )}

      {view.warnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("preview.warnings")}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-amber-900">
            {view.warnings.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
