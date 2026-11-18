"use client";

import { RouteSiteErrorPanel } from "@/components/layout/route-site-error-panel";

/**
 * The root error boundary, inside the root layout (marketing-landing SV-250, EP-10). It catches what no nearer boundary
 * catches, the route-group layouts and the root not-found included (Next 16 error.md: an error.js does not wrap the
 * layout of its own segment). Its language follows the path after hydration (G2 D-48). The thrown error is never shown.
 */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <RouteSiteErrorPanel retry={retry} />
    </main>
  );
}
