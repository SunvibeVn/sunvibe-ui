/**
 * Shares the promise of a call that is still running: a second call with the same key while the first has not
 * settled gets the same promise. Once it settles (resolved or rejected) the entry is removed, so nothing is cached
 * and the next call goes out again (spec 5.2: one request per open, no shared result cache).
 */
export function dedupeInflight<K, T>(fn: (key: K) => Promise<T>): (key: K) => Promise<T> {
  const pending = new Map<K, Promise<T>>();
  return (key) => {
    const running = pending.get(key);
    if (running !== undefined) return running;

    // The async wrapper turns a synchronous throw of `fn` into a rejection, so it is cleared like any other.
    const promise = (async () => fn(key))();
    pending.set(key, promise);
    const clear = () => {
      if (pending.get(key) === promise) pending.delete(key);
    };
    // Registered before the caller's own handlers, so the entry is gone when the caller continues.
    promise.then(clear, clear);
    return promise;
  };
}
