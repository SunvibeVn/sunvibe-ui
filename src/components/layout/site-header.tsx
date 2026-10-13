import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { headerNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";

/** `actions` are extra header items supplied by features, e.g. the auth user menu. */
export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 bg-navy-950">
      <nav className="mx-auto flex max-w-6xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label={`${siteConfig.name} home`}>
          <Logo tone="light" size="lg" />
        </Link>
        <div className="flex items-center gap-4 sm:gap-6">
          {headerNav.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="hidden text-sm font-medium text-white/80 transition-colors hover:text-white sm:inline"
            >
              {link.label}
            </a>
          ))}
          {actions}
          <a
            href={siteConfig.links.waitlist}
            className="hidden rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 sm:inline-block"
          >
            Get early access
          </a>
        </div>
      </nav>
    </header>
  );
}
