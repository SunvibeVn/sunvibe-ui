import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { headerNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";

/** `actions` are extra header items supplied by features, e.g. the auth user menu. */
export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label={`${siteConfig.name} home`}>
          <Logo />
        </Link>
        <div className="flex items-center gap-6">
          {headerNav.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-violet-700 sm:inline"
            >
              {link.label}
            </a>
          ))}
          {actions}
          <a
            href={siteConfig.links.waitlist}
            className="hidden rounded-full bg-navy-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-800 sm:inline-block"
          >
            Get early access
          </a>
        </div>
      </nav>
    </header>
  );
}
