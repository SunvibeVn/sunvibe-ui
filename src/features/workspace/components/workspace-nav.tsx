"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type WorkspaceNavItem } from "../lib/nav";

/** The left menu of the workspace; `onNavigate` lets the phone drawer close itself. */
export function WorkspaceNav({ items, onNavigate }: { items: readonly WorkspaceNavItem[]; onNavigate?: () => void }) {
  const t = useTranslations("Workspace.menu");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")}>
      <ul className="space-y-1">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
                className={`block rounded-xl px-3 py-2 text-[13px] font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${
                  current ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
