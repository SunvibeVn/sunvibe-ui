import type { ApiResult } from "@/features/auth/client";

import type { IntakeBlock, OwnerCheckContext, OwnerCheckSignals, OwnerCheckStarted } from "../types";

import { type CommandStep, commandFailure } from "./intake-command";
import { REASON_MAX, type TextProblem, textProblem } from "./intake-text";
import type { IntakeViewer } from "./intake-viewer";
import type { IntakeKey } from "./labels";

// The manager's owner check (property-create intake 4.6 step 6, D5-7, U-6). The context reaches its manager alone. The
// phrase exists in this state only and is shown once: no block, log, list or storage ever holds it.

/**
 * A manager role who is not the assignee reads the check of a proof; the server refuses anyone who has worked the lead. The
 * assignee is never sent there, because no screen of a Sale shows the context.
 */
export function readsOwnerCheck(block: Pick<IntakeBlock, "ownerCheck">, viewer: IntakeViewer): boolean {
  if (!viewer.manager || viewer.assignee) return false;
  return block.ownerCheck === "REQUIRED" || block.ownerCheck === "DONE";
}

/** A start and a refusal both need a check still required. */
export function canStartCheck(block: Pick<IntakeBlock, "ownerCheck">): boolean {
  return block.ownerCheck === "REQUIRED";
}

export type PhraseState = { kind: "none" } | { kind: "shown"; phrase: string; expiresAt: string | null };

export const NO_PHRASE: PhraseState = { kind: "none" };

export function phraseIssued(answer: OwnerCheckStarted): PhraseState {
  return answer.phrase ? { kind: "shown", phrase: answer.phrase, expiresAt: answer.expiresAt ?? null } : NO_PHRASE;
}

/** The answer is the only showing of a phrase: a clock running fast must not take it away at once. */
const PHRASE_MIN_MS = 60_000;

/** How long the phrase shows, for the panel to take it away; null when it names no end. */
export function phraseMsLeft(expiresAt: string | null, now: number): number | null {
  const end = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
  return Number.isNaN(end) ? null : Math.max(PHRASE_MIN_MS, end - now);
}

/** The note is made before the call, and must say why the manager goes on when another owner sits on this phone (D5-14). */
export function basisKey(context: Pick<OwnerCheckContext, "signals">): IntakeKey {
  return (context.signals?.otherOwnersOnPhone ?? 0) > 0 ? "ownerCheckPanel.basisOtherOwners" : "ownerCheckPanel.basisHint";
}

export function checkBasisProblem(value: string): TextProblem | null {
  return textProblem(value, REASON_MAX);
}

const SIGNALS: readonly (keyof OwnerCheckSignals)[] = [
  "accountProofs",
  "accountRefusals",
  "creatorProofs",
  "creatorRefusals",
  "otherOpenLeadsOfPhone",
  "otherOwnersOnPhone",
];

export type SignalRow = { key: IntakeKey; value: number };

export function signalRows(context: Pick<OwnerCheckContext, "signals">): SignalRow[] {
  return SIGNALS.map((name) => ({ key: `ownerCheckPanel.signals.${name}`, value: context.signals?.[name] ?? 0 }));
}

export type RefusalRow = { checkedAt: string | null; basis: string | null };

/** The lead's refusals, kept for the next checker. */
export function refusalRows(context: Pick<OwnerCheckContext, "refusals">): RefusalRow[] {
  return (context.refusals ?? []).map((row) => ({ checkedAt: row.checkedAt ?? null, basis: row.basis ?? null }));
}

type OwnerCheckDeps<T> = {
  send(): Promise<ApiResult<T>>;
  /** Forgets the context: its `proofId` may be stale. */
  forget(): void;
  reload(): Promise<unknown>;
};

/** Sends one start or refusal. A conflict forgets the context and reads the block, so only a fresh proof id goes next. */
export async function runOwnerCheck<T>({ send, forget, reload }: OwnerCheckDeps<T>): Promise<CommandStep<T>> {
  const result = await send();
  if (result.ok) return { kind: "done", data: result.data };
  const step = commandFailure(result);
  if (step.kind === "message" && step.reload) {
    forget();
    await reload();
  }
  return step;
}
