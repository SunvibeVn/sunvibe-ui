import type { IntakeBlock } from "../types";

import type { IntakeKey } from "./labels";

/**
 * What a Sale reads while a case holds the intake (U-6, BR-21): one fixed sentence, whatever the case is about. The block
 * tells the page no more than this, and the page adds nothing.
 */
export function caseGateKey(block: Pick<IntakeBlock, "status" | "caseState">): IntakeKey | null {
  const held = block.status === "CASE_OPEN" || block.caseState === "OPEN" || block.caseState === "WAITING";
  return held ? "caseGate.needsCheck" : null;
}
