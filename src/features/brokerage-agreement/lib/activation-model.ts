import type { BrokerageAgreementDetail, BrokerageAgreementVersion } from "../types";

/**
 * The activation part of the staff page (brokerage-agreement US-3 AC-1, S6-D8, S6-D22). `decide`: the viewer may decide
 * (a hint, the server decides): the confirmed version's number, when the owner confirmed it and until when it may be
 * activated (instants in UTC), the statement to make, and, when the version's fee is free of charge, its reason for the
 * check against the signed document (BR-7). `waiting`: anyone else reading the page sees until when it waits.
 */
export type ActivationModel =
  | {
      kind: "decide";
      versionNo: number;
      confirmedAt: string;
      activateBy: string;
      statementVersion: string;
      statementText: string;
      /** Set only when the version's fee formula is FREE; `reason` null when the answer holds none. */
      freeFee: { reason: string | null } | null;
    }
  | { kind: "waiting"; activateBy: string };

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/** The version awaiting activation: an OWNER_CONFIRMED one with its deadline, the latest by number if the answer held more. */
function awaitingActivation(versions: BrokerageAgreementVersion[]): (BrokerageAgreementVersion & { activateBy: string }) | null {
  let latest: (BrokerageAgreementVersion & { activateBy: string }) | null = null;
  for (const version of versions) {
    const { activateBy } = version;
    if (version.status !== "OWNER_CONFIRMED" || !present(activateBy)) continue;
    if (latest === null || (version.versionNo ?? 0) > (latest.versionNo ?? 0)) latest = { ...version, activateBy };
  }
  return latest;
}

/**
 * The activation part of the page from the detail (brokerage-agreement S6-D8, S6-D22): none without a usable statement
 * (absent, null, or a blank version or text) or without a confirmed version holding its deadline; the section for a
 * viewer who may decide and a version with the owner's answer time; the waiting line otherwise. No time is compared with
 * the browser's clock: the server answers the statement only while a version awaits activation.
 */
export function activationModel(detail: BrokerageAgreementDetail): ActivationModel | null {
  const statement = detail.activationStatement;
  if (statement === null || statement === undefined || !present(statement.version) || !present(statement.text)) return null;
  const version = awaitingActivation(detail.versions ?? []);
  if (version === null) return null;
  const { ownerAnsweredAt } = version;
  if (detail.viewerMayDecideActivation !== true || !present(ownerAnsweredAt)) {
    return { kind: "waiting", activateBy: version.activateBy };
  }
  const formula = version.feePolicy?.formula;
  return {
    kind: "decide",
    versionNo: version.versionNo ?? 0,
    confirmedAt: ownerAnsweredAt,
    activateBy: version.activateBy,
    statementVersion: statement.version,
    statementText: statement.text,
    freeFee: formula?.type === "FREE" ? { reason: present(formula.freeReason) ? formula.freeReason : null } : null,
  };
}
