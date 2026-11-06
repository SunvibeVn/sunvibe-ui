/**
 * What a page shows after a failed read. A read in the background, or the one after a refusal, must not take away the form
 * in use, with what was typed in it: only a page with nothing ready shows the failure.
 */
export function viewAfterFailedRead<V extends { kind: string }>(previous: V | null, failed: V): V {
  return previous?.kind === "ready" ? previous : failed;
}
