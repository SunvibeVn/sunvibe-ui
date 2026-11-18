"use client";

import { RouteSiteErrorPanel } from "@/components/layout/route-site-error-panel";
import { siteErrorText } from "@/i18n/site-error-text";

import "./globals.css";

/**
 * Replaces a failing root layout only; every other error reaches app/error.tsx (marketing-landing SV-250, EP-6). The
 * document stays Vietnamese on every path, <html lang="vi"> and the Vietnamese <title> (ADR-008 amendment
 * 2026-10-23); the panel follows the screen's language after hydration (G2 D-48). No intl provider (the root layout's
 * is gone here), no messages file and no Geist font. The thrown error is never shown.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>{siteErrorText("vi").title}</title>
        <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
          <RouteSiteErrorPanel retry={retry} />
        </main>
      </body>
    </html>
  );
}
