"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { paginationRange } from "@/components/ui/pagination-range";
import { useSession } from "@/features/auth/client";
import { BROKERAGE_AGREEMENTS_PATH } from "@/features/workspace";
import { type ListOutcome, useUrlList } from "@/lib/use-url-list";

import { type AgreementListError, agreementListOutcome, agreementListRows } from "../lib/agreement-list-model";
import {
  AGREEMENT_LIST_PAGE_SIZE,
  type AgreementListState,
  parseAgreementListState,
  serializeAgreementListState,
  toAgreementListQuery,
  withAgreementFilter,
} from "../lib/agreement-list-state";
import { listAgreements } from "../services/agreement-api";
import type { BrokerageAgreementPage } from "../types";

import { AgreementFilterPanel } from "./agreement-filter-panel";
import { AgreementList } from "./agreement-list";

async function loadAgreements(state: AgreementListState): Promise<ListOutcome<BrokerageAgreementPage, AgreementListError>> {
  return agreementListOutcome(await listAgreements(toAgreementListQuery(state)));
}

function hrefOf(state: AgreementListState): string {
  const query = serializeAgreementListState(state);
  return query === "" ? BROKERAGE_AGREEMENTS_PATH : `${BROKERAGE_AGREEMENTS_PATH}?${query}`;
}

/**
 * The agreement list `/workspace/brokerage-agreements` (brokerage-agreement US-4 AC-3, S7-D12, spec section 6): the
 * agreements the server answers for the signed-in staff member, newest first, or soonest end first with "Ends within the
 * next 30 days", 20 a page, each with its state and advertising answer at the read. The filters and the page live in the
 * address (`useUrlList`, which needs the page's Suspense boundary). The server decides the scope; nothing is stored.
 */
export function AgreementListView() {
  const t = useTranslations("BrokerageAgreement");
  const { user } = useSession();
  const userId = user?.userId ?? null;
  const { state, status, retry, setFilter } = useUrlList({
    path: BROKERAGE_AGREEMENTS_PATH,
    userId,
    parse: parseAgreementListState,
    serialize: serializeAgreementListState,
    withFilter: withAgreementFilter,
    load: loadAgreements,
    // A row whose lead moved to another Sale meanwhile does not show again on Back while the new read runs.
    forgetWhenHidden: true,
  });

  // Signed out or a session that is unavailable: the session screens answer, the list shows nothing.
  if (userId === null || (status.kind === "error" && status.error.kind === "session")) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t("list.title")}</h1>
      <AgreementFilterPanel state={state} onChange={setFilter} />
      {status.kind === "loading" ? (
        <p role="status" className="text-sm text-slate-500">
          {t("list.loading")}
        </p>
      ) : status.kind === "error" ? (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("list.loadFailed")}</p>
            {status.error.kind === "failed" && status.error.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("list.supportCode", { correlationId: status.error.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" onClick={retry}>
            {t("list.retry")}
          </Button>
        </div>
      ) : (
        <AgreementResults page={status.page} state={state} />
      )}
    </div>
  );
}

function AgreementResults({ page, state }: { page: BrokerageAgreementPage; state: AgreementListState }) {
  const t = useTranslations("BrokerageAgreement");
  const rows = agreementListRows(page);

  if (rows.length === 0) {
    const filtered = state.status !== undefined || state.ending;
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-700 shadow-sm">
        {t(filtered ? "list.emptyFiltered" : "list.empty")}
      </p>
    );
  }

  const range = paginationRange(state.page, AGREEMENT_LIST_PAGE_SIZE, page.totalElements ?? 0);
  return (
    <div className="space-y-4">
      <AgreementList rows={rows} />
      <Pagination
        page={state.page}
        totalPages={range.totalPages}
        hrefFor={(target) => hrefOf({ ...state, page: target })}
        label={t("list.pagination.label")}
        summary={t("list.pagination.pageOf", { page: state.page, total: range.totalPages })}
        previousLabel={t("list.pagination.previous")}
        nextLabel={t("list.pagination.next")}
      />
    </div>
  );
}
