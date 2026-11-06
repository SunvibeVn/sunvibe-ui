import type { ApiResult } from "@/features/auth/client";

import type { IntakeCompletionResult, IntakePreview } from "../types";

import { type CommandStep, commandFailure } from "./intake-command";

// The preview and the completion bound to it (U-3, spec 5.3). A preview belongs to one version of the block and one read:
// a refusal forgets it, and only a new read can be completed.

/** One read of the preview: the version of the block it was read for, and which attempt it answered. */
export type PreviewRead = { version: number | null; attempt: number; preview: IntakePreview };

/** The preview for this version and attempt; nothing of any other read. */
export function previewOfRead(read: PreviewRead | null, version: number | null, attempt: number): IntakePreview | null {
  return read !== null && read.version === version && read.attempt === attempt ? read.preview : null;
}

type CompletionDeps = {
  send(): Promise<ApiResult<IntakeCompletionResult>>;
  /** Forgets the preview, so nothing of it stays on screen. */
  clear(): void;
  /** Reads the block again. */
  reload(): Promise<unknown>;
};

/**
 * Sends one completion. Any refusal forgets the preview and reads the block, because nothing of that preview can be
 * completed any more; a 5xx or a lost answer does too, because the completion may have committed. Never throws.
 */
export async function runCompletion({ send, clear, reload }: CompletionDeps): Promise<CommandStep<IntakeCompletionResult>> {
  const result = await send();
  if (result.ok) {
    await reload();
    return { kind: "done", data: result.data };
  }
  const step = commandFailure(result);
  if (step.kind === "message" || step.kind === "fields") {
    clear();
    await reload();
  }
  return step;
}
