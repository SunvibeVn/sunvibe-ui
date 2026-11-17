import type { BrokerageAgreementConfirmationRequest } from "../types";

/** At most 20 versions go in one confirmation (brokerage-agreement S5-D5): the server's input bound, which the UI keeps. */
export const MAX_TICKED = 20;

/** One version the owner ticked: its agreement and its number. */
export type VersionKey = { agreementId: string; versionNo: number };

/**
 * The owner's confirm form without JSX (brokerage-agreement E05-S5, S5-D5): the ticked versions, in tick order, and the
 * current password, read from the form and sent once (BR-17); never stored anywhere else.
 */
export type OwnerConfirmValues = { ticked: VersionKey[]; password: string };

export const EMPTY_CONFIRM_VALUES: OwnerConfirmValues = { ticked: [], password: "" };

const same = (a: VersionKey, b: VersionKey) => a.agreementId === b.agreementId && a.versionNo === b.versionNo;

export function isTicked(values: OwnerConfirmValues, key: VersionKey): boolean {
  return values.ticked.some((ticked) => same(ticked, key));
}

export function canTickMore(values: OwnerConfirmValues): boolean {
  return values.ticked.length < MAX_TICKED;
}

/**
 * Ticks a version, once. A request names no agreement twice (S5-D5), so another version of a ticked agreement takes its
 * place; beyond 20 nothing more is ticked.
 */
export function tick(values: OwnerConfirmValues, key: VersionKey): OwnerConfirmValues {
  if (isTicked(values, key)) return values;
  const others = values.ticked.filter((ticked) => ticked.agreementId !== key.agreementId);
  if (others.length >= MAX_TICKED) return values;
  return { ...values, ticked: [...others, key] };
}

export function untick(values: OwnerConfirmValues, key: VersionKey): OwnerConfirmValues {
  return isTicked(values, key) ? { ...values, ticked: values.ticked.filter((ticked) => !same(ticked, key)) } : values;
}

/**
 * The one request of a confirmation (brokerage-agreement US-2 AC-2, AC-4): the password as typed, the statement version
 * the owner read and every ticked version; null when nothing is ticked, no password is entered or no statement was read.
 */
export function confirmBody(
  values: OwnerConfirmValues,
  statementVersion: string | null,
): BrokerageAgreementConfirmationRequest | null {
  if (values.ticked.length === 0 || values.password === "" || statementVersion === null || statementVersion === "") return null;
  return {
    currentPassword: values.password,
    statementVersion,
    versions: values.ticked.map(({ agreementId, versionNo }) => ({ agreementId, versionNo })),
  };
}
