"use client";

import { useEffect, useState } from "react";

/**
 * Whole seconds left until `until` (ISO time): 0 when there is no target or
 * it has passed, null until the first tick after a new target arrives.
 */
export function useCountdown(until?: string): number | null {
  const target = until ? Date.parse(until) : 0;
  const [now, setNow] = useState<{ target: number; time: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    const tick = () => setNow({ target, time: Date.now() });
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [target]);

  if (!target) return 0;
  if (!now || now.target !== target) return null;
  return Math.max(0, Math.ceil((target - now.time) / 1000));
}
