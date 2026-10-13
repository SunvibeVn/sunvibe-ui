"use client";

import type { ReactNode } from "react";

const MIN_DURATION_MS = 800;
const MAX_DURATION_MS = 2200;
const MS_PER_PX = 0.6;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Scrolls to the very top of the page with a slow ease. Without JS it falls back to the `#top` anchor. */
export function BackToTop({ className, children }: { className?: string; children: ReactNode }) {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const start = window.scrollY;
    if (start === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, 0);
      return;
    }

    // Phones render a much taller page, so a fixed duration covers far more distance and feels instant.
    const duration = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, start * MS_PER_PX));
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      window.scrollTo(0, start * (1 - easeInOutCubic(progress)));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return (
    <a href="#top" onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
