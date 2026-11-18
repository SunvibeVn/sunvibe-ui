import type { Metadata } from "next";

import { RouteNotFoundPanel } from "@/components/layout/route-not-found-panel";
import en from "@/i18n/messages/en.json";
import vi from "@/i18n/messages/vi.json";

export const metadata: Metadata = { title: vi.NotFound.title };

/**
 * The site's 404 page, for every unmatched URL and every notFound() without a nearer boundary (marketing-landing
 * SV-250). Next keeps the status 404 and adds noindex. It is prerendered once and served for every path, so its first
 * HTML is Vietnamese, the document's language (ADR-008); under an English section it shows English after hydration
 * (G2 D-48). Only the two NotFound objects cross to the client component.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <RouteNotFoundPanel vietnamese={vi.NotFound} english={en.NotFound} />
    </main>
  );
}
