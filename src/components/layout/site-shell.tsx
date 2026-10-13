import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Header, main and footer of the public site. `headerActions` lets features add header items. */
export function SiteShell({ headerActions, children }: { headerActions?: ReactNode; children: ReactNode }) {
  return (
    <div id="top" className="flex min-h-screen flex-col bg-white text-slate-900">
      <SiteHeader actions={headerActions} />
      <main className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
