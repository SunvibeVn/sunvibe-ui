"use client";

import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useState, type SelectHTMLAttributes } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";

import { changeProvince, changeWard, defaultProvinceCode, reconcileWard } from "../lib/catalog-selection";
import { loadProvinces, loadWards } from "../services/catalog";
import type { CatalogResult, CatalogSelectionChange, Province, Ward } from "../types/catalog";

export type CatalogSelectsProps = {
  provinceCode: string;
  wardCode: string;
  /** Every selection change, with the ward type and whether the map pin must be cleared. */
  onChange: (change: CatalogSelectionChange) => void;
  /** True only when a ward can be chosen; keep the submit disabled otherwise (loading, failed, empty). */
  onReadyChange?: (ready: boolean) => void;
  /** Read-only while submitting. */
  disabled?: boolean;
  provinceError?: string;
  wardError?: string;
};

type Loaded<T> = { key: string; result: CatalogResult<T> };

function Select({ invalid, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`block w-full rounded-xl border bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm ${
        invalid
          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
          : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
      } ${className}`}
      {...props}
    />
  );
}

/** Loads `load()` in the browser whenever `key` changes; `null` key loads nothing. */
function useCatalog<T>(key: string | null, load: () => Promise<CatalogResult<T>>) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const run = useEffectEvent(load);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    void run().then((result) => {
      if (active) setLoaded({ key, result });
    });
    return () => {
      active = false;
    };
  }, [key]);
  return key !== null && loaded?.key === key ? loaded.result : undefined;
}

function CatalogFailed({ correlationId, onRetry }: { correlationId?: string; onRetry: () => void }) {
  const t = useTranslations("OwnerIntake");
  return (
    <Alert tone="error">
      <p>{t("catalog.failed")}</p>
      {correlationId && <p className="mt-0.5 text-xs">{t("errors.supportCode", { correlationId })}</p>}
      <Button variant="secondary" className="mt-2 px-4 py-1.5" onClick={onRetry}>
        {t("catalog.retry")}
      </Button>
    </Alert>
  );
}

export function CatalogSelects({
  provinceCode,
  wardCode,
  onChange,
  onReadyChange,
  disabled = false,
  provinceError,
  wardError,
}: CatalogSelectsProps) {
  const t = useTranslations("OwnerIntake");
  const [provinceAttempt, setProvinceAttempt] = useState(0);
  const [wardAttempt, setWardAttempt] = useState(0);

  const provinces = useCatalog<Province>(`${provinceAttempt}`, () => loadProvinces());
  const wards = useCatalog<Ward>(provinceCode ? `${provinceCode}#${wardAttempt}` : null, () =>
    loadWards(provinceCode),
  );
  const provinceItems = provinces?.status === "ready" ? provinces.items : [];
  const wardItems = wards?.status === "ready" ? wards.items : [];
  const ready = provinces?.status === "ready" && wards?.status === "ready";

  const notify = useEffectEvent((change: CatalogSelectionChange | null | undefined) => {
    if (change) onChange(change);
  });
  const notifyReady = useEffectEvent((value: boolean) => onReadyChange?.(value));

  useEffect(() => {
    if (provinces?.status !== "ready") return;
    const code = defaultProvinceCode(provinceCode, provinces.items);
    if (code) notify(changeProvince({ provinceCode, wardCode }, code));
  }, [provinces, provinceCode, wardCode]);

  useEffect(() => {
    if (wards?.status === "ready") notify(reconcileWard({ provinceCode, wardCode }, wards.items));
  }, [wards, provinceCode, wardCode]);

  useEffect(() => notifyReady(ready), [ready]);

  const provinceLoading = provinces === undefined;
  const wardLoading = provinceCode !== "" && wards === undefined;
  const provinceHint = provinceLoading
    ? t("catalog.loading")
    : provinces.status === "empty"
      ? t("catalog.noProvinces")
      : undefined;
  const wardHint =
    provinceCode === ""
      ? t("fields.wardCode.hintChooseProvince")
      : wardLoading
        ? t("catalog.loading")
        : wards?.status === "empty"
          ? t("catalog.noWards")
          : undefined;

  return (
    <div className="space-y-4" aria-busy={provinceLoading || wardLoading || undefined}>
      <FormField id="provinceCode" label={t("fields.provinceCode.label")} error={provinceError} hint={provinceHint}>
        <Select
          id="provinceCode"
          name="provinceCode"
          required
          value={provinceCode}
          disabled={disabled || provinces?.status !== "ready"}
          invalid={Boolean(provinceError)}
          aria-describedby={describedBy("provinceCode", provinceError, Boolean(provinceHint))}
          onChange={(event) => {
            const change = changeProvince({ provinceCode, wardCode }, event.target.value);
            if (change) onChange(change);
          }}
        >
          <option value="">{t("fields.provinceCode.placeholder")}</option>
          {provinceItems.map((province) => (
            <option key={province.code} value={province.code}>
              {province.name}
            </option>
          ))}
        </Select>
      </FormField>
      {provinces?.status === "failed" && (
        <CatalogFailed correlationId={provinces.correlationId} onRetry={() => setProvinceAttempt((n) => n + 1)} />
      )}

      <FormField id="wardCode" label={t("fields.wardCode.label")} error={wardError} hint={wardHint}>
        <Select
          id="wardCode"
          name="wardCode"
          required
          value={wardCode}
          disabled={disabled || wards?.status !== "ready"}
          invalid={Boolean(wardError)}
          aria-describedby={describedBy("wardCode", wardError, Boolean(wardHint))}
          onChange={(event) => onChange(changeWard(provinceCode, wardItems, event.target.value))}
        >
          <option value="">{t("fields.wardCode.placeholder")}</option>
          {wardItems.map((ward) => (
            <option key={ward.code} value={ward.code}>
              {t("catalog.wardOption", { type: t(`catalog.wardType.${ward.type}`), name: ward.name })}
            </option>
          ))}
        </Select>
      </FormField>
      {wards?.status === "failed" && (
        <CatalogFailed correlationId={wards.correlationId} onRetry={() => setWardAttempt((n) => n + 1)} />
      )}
    </div>
  );
}
