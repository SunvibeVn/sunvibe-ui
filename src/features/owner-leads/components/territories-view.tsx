"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { type ApiResult, ForbiddenNotice, RequireRole, useSession } from "@/features/auth/client";

import { formatDateTime } from "../lib/format";
import { wardTypeLabelKey } from "../lib/labels";
import { type LeadUiError, toLeadUiError } from "../lib/lead-ui-error";
import { sendTerritoryChange } from "../lib/territory-flow";
import { holderFlag, type TerritoryProblem } from "../lib/territory-flags";
import { viewerOf } from "../lib/viewer";
import { listAssignees } from "../services/owner-leads-api";
import { listTerritories } from "../services/territories-api";
import type { Territory } from "../types";

import type { AssigneesLoad } from "./assignee-picker";
import { assigneeListHref } from "./list-href";
import { SupportCode, ProblemAlert } from "./territory-problem";
import { TerritoryAssignDialog } from "./territory-assign-dialog";
import { TerritoryRemoveDialog } from "./territory-remove-dialog";

/** A list that is loading, loaded or failed (the failure keeps the `toLeadUiError` case and the support code). */
type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; error: LeadUiError };

type OpenDialog = { kind: "assign" | "change" | "remove"; wardCode: string } | null;

type Notice = {
  kind: "assigned" | "changed" | "removed";
  ward: string;
  /** The new holder's name (assigned, changed). */
  holder?: string;
  /** The holder before the call (C-27, C-34): id and name taken before the request. */
  previous?: { id: string; name: string };
};

function toLoad<T>(result: ApiResult<T>): Load<T> {
  return result.ok
    ? { state: "ready", data: result.data }
    : { state: "error", error: toLeadUiError(result) ?? { kind: "retry" } };
}

/** Success notice after a change or removal; keeps the former holder with a link to their leads (C-27, C-34). */
function NoticeView({
  notice,
  previousHref,
  onDismiss,
}: {
  notice: Notice;
  previousHref: string | null;
  onDismiss(): void;
}) {
  const t = useTranslations("SaleTerritories");
  const text =
    notice.kind === "assigned"
      ? t("success.assigned", { holder: notice.holder ?? "", ward: notice.ward })
      : notice.kind === "changed"
        ? t("success.changed", { holder: notice.holder ?? "", ward: notice.ward })
        : t("success.removed", { ward: notice.ward });
  return (
    <Alert tone="success">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p>{text}</p>
          {notice.previous !== undefined && previousHref !== null && (
            <p>
              <Link
                href={previousHref}
                prefetch={false}
                className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {t("success.oldHolderLeads", { holder: notice.previous.name })}
              </Link>
            </p>
          )}
        </div>
        <Button variant="ghost" className="px-3 py-1.5" onClick={onDismiss}>
          {t("success.dismiss")}
        </Button>
      </div>
    </Alert>
  );
}

/**
 * The territories of the wards of province 48 (US-8, ADMIN; spec 5.5). Everything is read in the browser and kept in
 * component state: the view is keyed by the user id, so a user change starts clean, and an answer that arrives after
 * the view is gone is dropped. `GET /sale-territories` already lists every ward (holder null when none), so no ward
 * catalog is merged in.
 */
function TerritoriesContent() {
  const t = useTranslations("SaleTerritories");
  const o = useTranslations("OwnerLeads");
  const { user } = useSession();
  const roles = user?.roles;
  const viewer = useMemo(() => viewerOf(roles ?? []), [roles]);

  const [territories, setTerritories] = useState<Load<Territory[]>>({ state: "loading" });
  const [eligible, setEligible] = useState<AssigneesLoad>({ state: "loading" });
  const [territoryRound, setTerritoryRound] = useState(0);
  const [eligibleRound, setEligibleRound] = useState(0);

  const [dialog, setDialog] = useState<OpenDialog>(null);
  /** Number of the dialog on screen; a new dialog gets a new form state (key). */
  const [dialogNo, setDialogNo] = useState(0);
  const [dialogProblem, setDialogProblem] = useState<TerritoryProblem | null>(null);
  const [pageProblem, setPageProblem] = useState<TerritoryProblem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  /** One change at a time; read in handlers, not in render. */
  const busyRef = useRef(false);
  /** Number of the dialog on screen (null = none), so a late answer knows where to show its error. */
  const openNo = useRef<number | null>(null);
  const dialogCounter = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listTerritories().then((result) => {
      if (!cancelled) setTerritories(toLoad(result));
    });
    return () => {
      cancelled = true;
    };
  }, [territoryRound]);

  useEffect(() => {
    let cancelled = false;
    void listAssignees().then((result) => {
      if (cancelled) return;
      setEligible(
        result.ok
          ? { state: "ready", list: result.data }
          : { state: "error", error: toLeadUiError(result) ?? { kind: "retry" } },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [eligibleRound]);

  const reloadTerritories = () => {
    setTerritories({ state: "loading" });
    setTerritoryRound((n) => n + 1);
  };
  const reloadEligible = () => {
    setEligible({ state: "loading" });
    setEligibleRound((n) => n + 1);
  };

  const open = (kind: "assign" | "change" | "remove", wardCode: string) => {
    if (busyRef.current) return;
    dialogCounter.current += 1;
    openNo.current = dialogCounter.current;
    setDialogNo(dialogCounter.current);
    setDialogProblem(null);
    setPageProblem(null);
    setDialog({ kind, wardCode });
  };
  const closeDialog = () => {
    openNo.current = null;
    setDialogProblem(null);
    setDialog(null);
  };

  // Activity hides the route without unmounting it: close the dialog before it is hidden, so it does not come back
  // open (as in the lead actions slot). A change still on its way then reports on the page, not in a closed dialog.
  useLayoutEffect(
    () => () => {
      openNo.current = null;
      setDialogProblem(null);
      setDialog(null);
    },
    [],
  );

  const rows = territories.state === "ready" ? territories.data : [];
  const target = dialog === null ? undefined : rows.find((row) => row.wardCode === dialog.wardCode);

  /**
   * Runs one change (`userId`) or removal (null). The former holder (id and name) is taken from the row before the
   * call (C-34). A late answer (after Esc) shows its error on the page instead of in the closed dialog. Resolves when
   * the call is over.
   */
  const run = async (territory: Territory, userId: string | null, newHolderName: string | undefined) => {
    const wardCode = territory.wardCode;
    if (busyRef.current || wardCode === undefined) return;
    busyRef.current = true;
    setBusy(true);
    setDialogProblem(null);
    setPageProblem(null);
    setNotice(null);
    const shownIn = openNo.current;
    const ward = territory.wardName ?? "";
    const previous =
      territory.userId !== undefined && territory.userId !== ""
        ? { id: territory.userId, name: territory.userName?.trim() ? territory.userName : t("holder.unknown") }
        : undefined;

    const outcome = await sendTerritoryChange(wardCode, userId);
    busyRef.current = false;
    if (!mounted.current) return;
    setBusy(false);

    if (outcome.ok) {
      // The kind follows the request (CR-6): a removal clears the row, a change takes the PUT body.
      const patch = (row: Territory): Territory =>
        outcome.kind === "removed"
          ? { ...row, userId: undefined, userName: null, assignedAt: undefined }
          : { ...row, ...outcome.saved };
      setTerritories((current) =>
        current.state !== "ready"
          ? current
          : { state: "ready", data: current.data.map((row) => (row.wardCode !== wardCode ? row : patch(row))) },
      );
      const base: Notice =
        outcome.kind === "removed"
          ? { kind: "removed", ward }
          : {
              kind: previous === undefined ? "assigned" : "changed",
              ward,
              holder: outcome.saved.userName?.trim()
                ? outcome.saved.userName
                : (newHolderName ?? t("holder.unknown")),
            };
      setNotice(previous === undefined ? base : { ...base, previous });
      closeDialog();
      return;
    }

    // 422: the person can no longer take leads; the picker list is loaded again and they drop out of it (E-6).
    if (outcome.problem.kind === "ineligible") reloadEligible();
    if (shownIn !== null && openNo.current === shownIn) setDialogProblem(outcome.problem);
    else setPageProblem(outcome.problem);
  };

  // A holder is flagged only against a list that loaded: after a failed load nobody is called ineligible.
  const flagged = (row: Territory): boolean =>
    eligible.state === "ready" && holderFlag(row, eligible.list) === "ineligible";

  const columns: DataTableColumn<Territory>[] = [
    { key: "ward", header: t("table.ward"), cell: (row) => <span className="font-medium">{row.wardName}</span> },
    {
      key: "type",
      header: t("table.type"),
      cell: (row) => {
        const key = wardTypeLabelKey(row.wardType);
        return key === null ? "" : o(key);
      },
    },
    {
      key: "holder",
      header: t("table.holder"),
      cell: (row) => {
        if (row.userId === undefined || row.userId === "") {
          return <span className="text-slate-500">{t("holder.none")}</span>;
        }
        return (
          <div className="space-y-1">
            <p>{row.userName?.trim() ? row.userName : t("holder.unknown")}</p>
            {flagged(row) && <Badge tone="warning">{t("holder.ineligible")}</Badge>}
          </div>
        );
      },
    },
    {
      key: "assignedAt",
      header: t("table.assignedAt"),
      cell: (row) => (row.assignedAt === undefined ? "" : formatDateTime(row.assignedAt)),
    },
    {
      key: "actions",
      header: t("table.actions"),
      cell: (row) => {
        const code = row.wardCode;
        if (code === undefined) return null;
        const ward = row.wardName ?? "";
        const held = row.userId !== undefined && row.userId !== "";
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="px-4 py-1.5"
              disabled={busy}
              aria-label={held ? t("actions.changeFor", { ward }) : t("actions.assignFor", { ward })}
              onClick={() => open(held ? "change" : "assign", code)}
            >
              {held ? t("actions.change") : t("actions.assign")}
            </Button>
            {held && (
              <Button
                variant="ghost"
                className="px-4 py-1.5"
                disabled={busy}
                aria-label={t("actions.removeFor", { ward })}
                onClick={() => open("remove", code)}
              >
                {t("actions.remove")}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  let body: ReactNode;
  if (territories.state === "loading") {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t("loading")}</span>
        {[0, 1, 2, 3].map((block) => (
          <div key={block} aria-hidden className="h-12 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
    );
  } else if (territories.state === "error") {
    body =
      territories.error.kind === "forbidden" ? (
        <ForbiddenNotice />
      ) : (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("loadFailed")}</p>
            <SupportCode correlationId={territories.error.correlationId} />
          </Alert>
          <Button variant="secondary" onClick={reloadTerritories}>
            {t("retry")}
          </Button>
        </div>
      );
  } else if (rows.length === 0) {
    body = <p className="text-sm text-slate-600">{t("empty")}</p>;
  } else {
    body = (
      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-0">
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.wardCode ?? ""} caption={t("table.caption")} />
      </div>
    );
  }

  const previousHref = notice?.previous === undefined ? null : assigneeListHref(notice.previous.id, viewer);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-600">{t("description")}</p>
      </header>
      <Alert tone="info">{t("newLeadsOnly")}</Alert>
      {notice !== null && <NoticeView notice={notice} previousHref={previousHref} onDismiss={() => setNotice(null)} />}
      {pageProblem !== null && <ProblemAlert problem={pageProblem} />}
      {eligible.state === "error" && eligible.error.kind !== "forbidden" && territories.state === "ready" && (
        <div className="space-y-2">
          <Alert tone="info">
            <p>{t("eligibleLoadFailed")}</p>
            <SupportCode correlationId={eligible.error.correlationId} />
          </Alert>
          <Button variant="secondary" onClick={reloadEligible}>
            {t("retry")}
          </Button>
        </div>
      )}
      {body}
      {dialog !== null && target !== undefined && dialog.kind !== "remove" && (
        <TerritoryAssignDialog
          key={dialogNo}
          territory={target}
          eligible={eligible}
          busy={busy}
          problem={dialogProblem}
          onRetryEligible={reloadEligible}
          onSubmit={(userId, name) => run(target, userId, name)}
          onUnchanged={closeDialog}
          onClose={closeDialog}
        />
      )}
      {dialog !== null && target !== undefined && dialog.kind === "remove" && (
        <TerritoryRemoveDialog
          key={dialogNo}
          territory={target}
          busy={busy}
          problem={dialogProblem}
          onConfirm={() => run(target, null, undefined)}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}

/**
 * Territories page body (spec 5.5, US-8): ADMIN only (SUPER_ADMIN counts as ADMIN); anyone else gets the 403 screen.
 * Keyed by the user id so nothing survives a user change.
 */
export function TerritoriesView() {
  const { user } = useSession();
  return (
    <RequireRole anyOf={["ADMIN"]}>
      <TerritoriesContent key={user?.userId ?? ""} />
    </RequireRole>
  );
}
