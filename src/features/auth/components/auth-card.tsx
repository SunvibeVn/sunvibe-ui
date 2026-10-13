import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { AuthModeSwitch, AuthPanelCopy } from "./auth-mode";

/** Site header above a centered card for the log in and sign up pages: brand panel on the left, form on the right. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-navy-950 bg-[radial-gradient(ellipse_60%_50%_at_0%_0%,rgba(249,115,22,0.25),transparent_70%),radial-gradient(ellipse_50%_50%_at_100%_100%,rgba(139,92,246,0.3),transparent_70%),linear-gradient(160deg,#04052b_0%,#0c0e45_100%)]">
      <SiteHeader />
      <div className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div className="relative w-full max-w-4xl">
          <div className="overflow-hidden rounded-[2rem] bg-white shadow-2xl lg:grid lg:grid-cols-[45%_1fr]">
            <aside className="relative bg-brand-gradient px-6 pb-8 pt-7 text-white sm:px-10 lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-12">
              <AuthPanelCopy />
              <AuthModeSwitch className="mt-6 flex lg:hidden" />
            </aside>

            <main id="top" className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-12">
              <div className="w-full sm:w-4/5 sm:mx-auto">{children}</div>
            </main>
          </div>

          <AuthModeSwitch className="absolute left-[45%] top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex lg:flex-col" />
        </div>
      </div>
    </div>
  );
}
