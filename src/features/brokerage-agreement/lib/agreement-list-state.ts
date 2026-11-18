import type { AgreementListQuery, AgreementStatus } from "../types";

/** Agreements per page of the list (brokerage-agreement E05-S7, spec section 6). */
export const AGREEMENT_LIST_PAGE_SIZE = 20;

/** `Record` over the generated union: a state without an entry fails `npm run typecheck` (brokerage-agreement BR-5). */
const STATUS_CODES: Record<AgreementStatus, true> = {
  DRAFTING: true,
  AWAITING_CONFIRMATION: true,
  ACTIVE: true,
  SUSPENDED: true,
  EXPIRED: true,
  TERMINATED: true,
  CANCELLED: true,
};

/** The seven states of an agreement, in the order the state filter lists them (brokerage-agreement BR-5). */
export const AGREEMENT_STATUSES = Object.keys(STATUS_CODES) as AgreementStatus[];

/**
 * The agreement list as the address describes it (brokerage-agreement E05-S7, spec section 6): one stored state or
 * every state, the "Ends within the next 30 days" filter, and a 1-based page.
 */
export type AgreementListState = { status?: AgreementStatus; ending: boolean; page: number };

/** 1 to 10000, so the zero-based API page is 0 to 9999, the bounds the API accepts (E05S7-P7). */
const PAGE = /^(?:[1-9][0-9]{0,3}|10000)$/;

const isStatus = (value: string | null): value is AgreementStatus => value !== null && Object.hasOwn(STATUS_CODES, value);

/**
 * Reads the list address: `status` exactly one of the seven codes, else dropped (every state); `ending` only `1`; `page`
 * a whole number from 1 to 10000, else 1. Run it before any call and replace the address with
 * `serializeAgreementListState` of the result when it differs.
 */
export function parseAgreementListState(params: URLSearchParams): AgreementListState {
  const status = params.get("status");
  const page = params.get("page");
  const state: AgreementListState = {
    ending: params.get("ending") === "1",
    page: page !== null && PAGE.test(page) ? Number(page) : 1,
  };
  if (isStatus(status)) state.status = status;
  return state;
}

/** The query string (without `?`): the state, then `ending=1`, then a page above 1, each only when set. */
export function serializeAgreementListState(state: AgreementListState): string {
  const params = new URLSearchParams();
  if (state.status !== undefined) params.set("status", state.status);
  if (state.ending) params.set("ending", "1");
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** A change of the state filter or of the ending filter, on page 1; `null` clears the state filter. */
export function withAgreementFilter(
  state: AgreementListState,
  change: { status?: AgreementStatus | null; ending?: boolean },
): AgreementListState {
  const status = change.status === undefined ? state.status : (change.status ?? undefined);
  const next: AgreementListState = { ending: change.ending ?? state.ending, page: 1 };
  if (status !== undefined) next.status = status;
  return next;
}

/** The list API query of the address: the state as a list of one, the ending filter when set, a zero-based page, size 20. */
export function toAgreementListQuery(state: AgreementListState): AgreementListQuery {
  const query: AgreementListQuery = { page: state.page - 1, size: AGREEMENT_LIST_PAGE_SIZE };
  if (state.status !== undefined) query.status = [state.status];
  if (state.ending) query.endsWithin30Days = true;
  return query;
}
