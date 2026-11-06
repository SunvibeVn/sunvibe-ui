/** One completion at a time and none after it: the repeat of a double click sends nothing (U-5). */
export type CompletionGuard = {
  /** True when this click may go on; it then holds the guard until `leave`. */
  enter(): boolean;
  leave(completed: boolean): void;
};

export function createCompletionGuard(): CompletionGuard {
  let state: "open" | "sending" | "completed" = "open";
  return {
    enter() {
      if (state !== "open") return false;
      state = "sending";
      return true;
    },
    leave(completed) {
      state = completed ? "completed" : "open";
    },
  };
}
