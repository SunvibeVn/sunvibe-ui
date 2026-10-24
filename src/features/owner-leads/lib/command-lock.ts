/**
 * The parts of the detail page that send a command: the assign dialog, the new history entry, the survey dialogs and
 * the requirement change. They share one lock (CR-2): while any of them waits for its answer, every command button of
 * the page is disabled (Review Focus 5).
 */
export type CommandSource = "assign" | "entry" | "survey" | "requirement";

/** `sources` with `source` added; the same array when it is already there. */
export function add(sources: readonly CommandSource[], source: CommandSource): readonly CommandSource[] {
  return sources.includes(source) ? sources : [...sources, source];
}

/** `sources` without `source`; the same array when it was not there. */
export function remove(sources: readonly CommandSource[], source: CommandSource): readonly CommandSource[] {
  return sources.includes(source) ? sources.filter((item) => item !== source) : sources;
}

/** True while any command of the page is on its way. */
export function isBusy(sources: readonly CommandSource[]): boolean {
  return sources.length > 0;
}
