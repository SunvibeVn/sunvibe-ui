"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { useSession } from "@/features/auth/client";

import { listAssignees, listWards } from "../services/owner-leads-api";
import { STATUS_LABEL, wardTypeLabelKey } from "../lib/labels";
import {
  type ListState,
  clearFilters,
  closedToggle,
  hasActiveFilter,
  statusBoxes,
  toggleClosed,
} from "../lib/list-url-state";
import type { Viewer } from "../lib/viewer";
import {
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

/**
 * The owner's filter bar background (C-45). Text sits on dark backings that keep WCAG AA on every part of it (A-11):
 * white on a chip of black/40 over the lightest stop #ea580c is about 8:1; the legend and the select labels stay in
 * the dark left and middle part; the white focus ring is at least 3.5:1 against every stop.
 */
const BAR =
  "space-y-3 rounded-xl bg-[linear-gradient(135deg,#120500_0%,#4a1502_45%,#852c06_75%,#ea580c_100%)] p-4 text-white shadow-sm";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const CHIP = `inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-white/30 bg-black/40 px-3 py-1.5 text-sm text-white has-[:checked]:border-white has-[:checked]:bg-white has-[:checked]:text-orange-900 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white`;
const BOX = "h-4 w-4 accent-orange-700 focus-visible:outline-none";
const LABEL = "mb-1 block text-sm font-semibold text-white";
const LOAD_FAILED = "mt-1 inline-block rounded bg-white px-2 py-0.5 text-xs text-rose-800";

/** Ward and assignee filters of "All Leads". Mounted only there, so a SALE or another tab never loads either list. */
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
        <label htmlFor={wardId} className={LABEL}>
          {t("filters.ward")}
        </label>
        <Select
          id={wardId}
          value={state.ward ?? ""}
          onChange={(event) => onNavigate(listHref(state, { ward: event.target.value || null }, viewer))}
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
          <p role="status" className={LOAD_FAILED}>
            {t("filters.wardLoadFailed")}
          </p>
        )}
      </div>
      {loadAssignees && (
        <div>
          <label htmlFor={assigneeId} className={LABEL}>
            {t("filters.assignee")}
          </label>
          <Select
            id={assigneeId}
            value={state.assignee ?? ""}
            onChange={(event) =>
              onNavigate(listHref(state, { assignee: event.target.value || null }, viewer))
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
            <p role="status" className={LOAD_FAILED}>
              {t("filters.assigneeLoadFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Status checkboxes of the tab (C-45), "Show closed leads" and (on "All Leads") ward and assignee (spec 5.3). The
 * boxes mirror the effective filter. Every change navigates to a URL built by `listHref`: page 1, only what the
 * viewer may open.
 */
export function LeadFilters(props: LeadFiltersProps) {
  const { state, viewer, onNavigate } = props;
  const t = useTranslations("OwnerLeads");
  const closedBox = useRef<HTMLInputElement>(null);
  const closed = closedToggle(state);

  // A mixed closed set shows the third state of the box (A-8); only a ref can set it.
  useEffect(() => {
    if (closedBox.current) closedBox.current.indeterminate = closed === "mixed";
  }, [closed]);

  const toggle = (status: LeadStatus): void => {
    const next = state.statuses.includes(status)
      ? state.statuses.filter((s) => s !== status)
      : [...state.statuses, status];
    onNavigate(listHref(state, { statuses: next }, viewer));
  };

  return (
    <section aria-label={t("filters.label")} className={BAR}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-orange-100">{t("filters.status")}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {statusBoxes(state.scope, state.assignee).map((status) => (
            <label key={status} className={CHIP}>
              <input
                type="checkbox"
                checked={state.statuses.includes(status)}
                onChange={() => toggle(status)}
                className={BOX}
              />
              {t(STATUS_LABEL[status])}
            </label>
          ))}
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-white/30 sm:block" />
          <label className={CHIP}>
            <input
              ref={closedBox}
              type="checkbox"
              checked={closed === "checked"}
              onChange={() => onNavigate(listHref(state, { statuses: toggleClosed(state).statuses }, viewer))}
              className={BOX}
            />
            {t("filters.showClosed")}
          </label>
        </div>
      </fieldset>
      {state.scope === "all" && <AllTabFilters {...props} />}
      {hasActiveFilter(state) && (
        <Link
          href={listHref(clearFilters(state), {}, viewer)}
          prefetch={false}
          className={`inline-flex min-h-10 items-center rounded-full bg-black/40 px-3 text-sm font-semibold text-white underline-offset-2 hover:underline ${FOCUS}`}
        >
          {t("filters.clear")}
        </Link>
      )}
    </section>
  );
}
