"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Select } from "@/components/ui/select";
import { useSession } from "@/features/auth/client";

import { listAssignees, listWards } from "../services/owner-leads-api";
import { STATUS_LABEL, wardTypeLabelKey } from "../lib/labels";
import { type ListState, hasActiveFilter, pickedStatuses } from "../lib/list-url-state";
import type { Viewer } from "../lib/viewer";
import {
  LEAD_STATUSES,
  type EligibleAssignee,
  type LeadStatus,
  type LeadSummary,
  type Ward,
} from "../types";

import { assigneeFilterLabel } from "./assignee-filter-label";
import { listHref } from "./list-href";
import { useAssigneeOptionLabel } from "./use-assignee-option-label";

type LeadFiltersProps = {
  state: ListState;
  viewer: Viewer;
  /** Rows of the page on screen: the source of a former holder's name (C-34). */
  rows: readonly LeadSummary[];
  /** Replaces the URL with `href` (always built by `listHref`, so it holds only what the viewer may open). */
  onNavigate: (href: string) => void;
};

type Loaded<T> = { userId: string; status: "ok"; items: T[] } | { userId: string; status: "failed" };

const CHECK_LABEL =
  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 has-[:checked]:border-violet-300 has-[:checked]:bg-violet-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

/** Ward and assignee filters of the "all" tab. Mounted only there, so a SALE or another tab never loads either list. */
function AllTabFilters({ state, viewer, rows, onNavigate }: LeadFiltersProps) {
  const t = useTranslations("OwnerLeads");
  const { user } = useSession();
  const userId = user?.userId ?? "";
  const wardId = useId();
  const assigneeId = useId();
  const [wards, setWards] = useState<Loaded<Ward> | null>(null);
  const [assignees, setAssignees] = useState<Loaded<EligibleAssignee> | null>(null);
  const loadAssignees = viewer.access === "ALL";

  useEffect(() => {
    if (userId === "") return;
    let cancelled = false;
    void listWards().then((result) => {
      if (cancelled) return;
      setWards(result.ok ? { userId, status: "ok", items: result.data } : { userId, status: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    // The endpoint answers 403 to a SALE: it is asked for ALL viewers only.
    if (userId === "" || !loadAssignees) return;
    let cancelled = false;
    void listAssignees().then((result) => {
      if (cancelled) return;
      setAssignees(result.ok ? { userId, status: "ok", items: result.data } : { userId, status: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, loadAssignees]);

  // Another user's answer is never shown.
  const wardList = wards?.userId === userId ? wards : null;
  const assigneeList = assignees?.userId === userId ? assignees : null;

  const wardItems = wardList?.status === "ok" ? wardList.items : [];
  const wardKnown = state.ward === undefined || wardItems.some((ward) => ward.code === state.ward);

  const eligible = assigneeList?.status === "ok" ? assigneeList.items : [];
  // While the eligible list is not loaded (or failed) nobody is called a former holder (C-34): null says so.
  const assigneeLabel =
    state.assignee === undefined
      ? null
      : assigneeFilterLabel(state.assignee, assigneeList?.status === "ok" ? eligible : null, rows);
  const assigneeKnown = state.assignee === undefined || eligible.some((person) => person.userId === state.assignee);

  const optionLabel = useAssigneeOptionLabel();
  const wardTypeText = (type: string | null | undefined): string => {
    const key = wardTypeLabelKey(type);
    return key === null ? "" : t(key);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={wardId} className="mb-1 block text-sm font-medium text-slate-700">
          {t("filters.ward")}
        </label>
        <Select
          id={wardId}
          value={state.ward ?? ""}
          onChange={(event) => onNavigate(listHref(state, { ward: event.target.value || undefined }, viewer))}
        >
          <option value="">{t("filters.wardAny")}</option>
          {!wardKnown && state.ward !== undefined && <option value={state.ward}>{state.ward}</option>}
          {wardItems.map((ward) => (
            <option key={ward.code} value={ward.code}>
              {t("filters.wardOption", {
                type: wardTypeText(ward.type),
                name: ward.name ?? "",
              }).trim()}
            </option>
          ))}
        </Select>
        {wardList?.status === "failed" && (
          <p role="status" className="mt-1 text-xs text-rose-700">
            {t("filters.wardLoadFailed")}
          </p>
        )}
      </div>
      {loadAssignees && (
        <div>
          <label htmlFor={assigneeId} className="mb-1 block text-sm font-medium text-slate-700">
            {t("filters.assignee")}
          </label>
          <Select
            id={assigneeId}
            value={state.assignee ?? ""}
            onChange={(event) =>
              onNavigate(listHref(state, { assignee: event.target.value || undefined }, viewer))
            }
          >
            <option value="">{t("filters.assigneeAny")}</option>
            {!assigneeKnown && state.assignee !== undefined && (
              <option value={state.assignee}>
                {assigneeLabel === null
                  ? t("filters.assigneeOther")
                  : assigneeLabel.formerHolder
                    ? t("filters.assigneeFormer", { name: assigneeLabel.name })
                    : assigneeLabel.name}
              </option>
            )}
            {eligible.map((person) => (
              <option key={person.userId} value={person.userId}>
                {optionLabel(person)}
              </option>
            ))}
          </Select>
          {assigneeList?.status === "failed" && (
            <p role="status" className="mt-1 text-xs text-rose-700">
              {t("filters.assigneeLoadFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Status checkboxes, "Hiện cả lead đã đóng" and (on "Tất cả") ward and assignee (spec 5.3). Every change navigates to a
 * URL built by `listHref`: page 1, only what the viewer may open. A picked status wins over "closed" (C-26), so the
 * closed box is disabled with a note while a pick is active instead of silently dropping it.
 */
export function LeadFilters(props: LeadFiltersProps) {
  const { state, viewer, onNavigate } = props;
  const t = useTranslations("OwnerLeads");
  const picked = pickedStatuses(state);

  const toggle = (status: LeadStatus): void => {
    const next = picked.includes(status) ? picked.filter((s) => s !== status) : [...picked, status];
    onNavigate(listHref(state, { statuses: LEAD_STATUSES.filter((s) => next.includes(s)) }, viewer));
  };

  // "Chưa giao" is always NEW leads: nothing to filter.
  if (state.scope === "unassigned") return null;

  return (
    <section aria-label={t("filters.label")} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">{t("filters.status")}</legend>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((status) => (
            <label key={status} className={CHECK_LABEL}>
              <input
                type="checkbox"
                checked={picked.includes(status)}
                onChange={() => toggle(status)}
                className="h-4 w-4 accent-violet-600"
              />
              {t(STATUS_LABEL[status])}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={state.includeClosed}
            disabled={picked.length > 0}
            onChange={() => onNavigate(listHref(state, { includeClosed: !state.includeClosed }, viewer))}
            className="h-4 w-4 accent-violet-600"
          />
          {t("filters.showClosed")}
        </label>
        {picked.length > 0 && <p className="mt-1 text-xs text-slate-500">{t("filters.showClosedIgnored")}</p>}
      </div>
      {state.scope === "all" && <AllTabFilters {...props} />}
      {hasActiveFilter(state) && (
        <Link
          href={listHref(
            state,
            { statuses: [], includeClosed: false, ward: undefined, assignee: undefined },
            viewer,
          )}
          prefetch={false}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          {t("filters.clear")}
        </Link>
      )}
    </section>
  );
}
