import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { BrainIcon, ChatIcon, FileCheckIcon } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { AuthIllustration } from "./auth-illustration";

const highlights = [
  { icon: <BrainIcon size={18} />, text: "AI matchmaking between landlords and tenants" },
  { icon: <FileCheckIcon size={18} />, text: "Digital leases, checks and rent tracking" },
  { icon: <ChatIcon size={18} />, text: "A leasing assistant that answers 24/7" },
];

/** Split-screen layout for the sign-in pages: brand panel on large screens, form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[44%] max-w-xl flex-col overflow-hidden bg-navy-950 p-10 text-white lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_20%_110%,rgba(249,115,22,0.35),transparent_70%),radial-gradient(ellipse_60%_50%_at_90%_100%,rgba(34,211,238,0.25),transparent_70%),radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(139,92,246,0.35),transparent_70%)]"
        />
        <Link href="/" className="relative w-fit" aria-label={`${siteConfig.name} home`}>
          <Logo tone="light" />
        </Link>
        <div className="relative my-auto py-10">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Renting, made effortless by AI.
          </h2>
          <AuthIllustration className="mt-10 w-full max-w-md" />
          <ul className="mt-10 space-y-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-300">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">© 2026 {siteConfig.legalName}</p>
      </aside>

      <main id="top" className="flex flex-1 flex-col">
        <div className="px-4 pt-6 sm:px-8 lg:hidden">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="px-4 pb-6 text-center text-xs text-slate-400 sm:px-8">
          Need help?{" "}
          <a href={siteConfig.links.contact} className="font-medium text-slate-600 hover:text-violet-700">
            {siteConfig.contactEmail}
          </a>
        </p>
      </main>
    </div>
  );
}
