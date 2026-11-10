"use client";

import { usePathname } from "next/navigation";

/**
 * A one-line notice above the page, in the language of the route: the staff workspace is English (C-41), every other
 * route Vietnamese. The texts come in as props, because the root layout that renders it sits above the workspace's
 * English message provider.
 */
export function RouteLanguageNotice({ text, workspaceText }: { text: string; workspaceText: string }) {
  const pathname = usePathname();
  const inWorkspace = pathname === "/workspace" || pathname.startsWith("/workspace/");

  return (
    <p
      role="note"
      lang={inWorkspace ? "en" : "vi"}
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      {inWorkspace ? workspaceText : text}
    </p>
  );
}
