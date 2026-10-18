"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { LogOutIcon } from "@/components/icons";
import { RequireRole, RequireSession, useSession, useSignOutHere } from "@/features/auth/client";
import { STAFF_WORKSPACE_ROLES, workspaceNav } from "../lib/nav";
import { WorkspaceLink } from "./workspace-link";
import { WorkspaceNav } from "./workspace-nav";

/**
 * Client shell of every workspace page: session → staff role → header, menu and the page. `RequireSession` without
 * `texts` uses the Vietnamese `Session` messages. The server layout renders it, and the pages load their data in the
 * browser after hydration (spec 5.2). The drafts follow the session through `DraftSessionSync` in the root layout.
 */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <RequireRole anyOf={STAFF_WORKSPACE_ROLES}>
        <WorkspaceFrame>{children}</WorkspaceFrame>
      </RequireRole>
    </RequireSession>
  );
}

function WorkspaceFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("Workspace");
  const { user } = useSession();
  const signOutHere = useSignOutHere();
  const pathname = usePathname();
  // The drawer is open for the path it was opened on, so a navigation closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const drawerOpen = openAt === pathname;
  const items = workspaceNav(user?.roles ?? []);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Open: focus moves to the first link and Esc closes. Close: focus returns to the menu button.
  useEffect(() => {
    if (!drawerOpen) return;
    const button = menuButton.current;
    panel.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (button?.isConnected) button.focus();
    };
  }, [drawerOpen]);

  // aria-modal: keep Tab inside the panel while it is open.
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Tab") return;
    const links = panel.current?.querySelectorAll<HTMLElement>("a[href]");
    if (!links || links.length === 0) return;
    const first = links[0];
    const last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a
        href="#workspace-main"
        className="sr-only z-[60] rounded-md bg-white px-3 py-2 text-sm font-medium text-navy-950 focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
      >
        {t("skipToContent")}
      </a>
      <header className="sticky top-0 z-50 bg-navy-950">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setOpenAt(drawerOpen ? null : pathname)}
              aria-expanded={drawerOpen}
              aria-controls="workspace-drawer"
              aria-label={drawerOpen ? t("menu.close") : t("menu.open")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                {drawerOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
            <Link href="/" aria-label={t("header.home")}>
              <Logo tone="light" size="lg" />
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="hidden sm:inline-flex">
              <WorkspaceLink />
            </span>
            <span className="min-w-0 max-w-28 truncate text-sm font-medium text-white/90 sm:max-w-xs">
              {user?.fullName}
            </span>
            <button
              type="button"
              onClick={signOutHere}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 p-2 text-sm sm:px-4 font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <LogOutIcon size={16} />
              <span className="sr-only sm:not-sr-only">{t("header.signOut")}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
          <WorkspaceNav items={items} />
        </aside>
        {drawerOpen && (
          <div id="workspace-drawer" className="fixed inset-x-0 bottom-0 top-16 z-40 md:hidden">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("menu.close")}
              onClick={() => setOpenAt(null)}
              className="absolute inset-0 bg-navy-950/40"
            />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={t("menu.label")}
              onKeyDown={keepFocusInside}
              className="relative h-full w-64 max-w-[85%] overflow-y-auto bg-white p-4 shadow-xl"
            >
              <WorkspaceNav items={items} onNavigate={() => setOpenAt(null)} />
            </div>
          </div>
        )}
        <main id="workspace-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
