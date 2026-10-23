import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { WorkspaceShell } from "@/features/workspace";
import en from "@/i18n/messages/en.json";

// Staff pages: never indexed, and the titles stay generic (no name or code, BR-2).
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

/**
 * The workspace is English (C-41): its own provider replaces the Vietnamese messages for the whole subtree, the session
 * screens of `RequireSession` included. `<html lang>` stays `vi`; the request config reads no headers or cookies.
 */
export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return (
    <div lang="en">
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
        <WorkspaceShell>{children}</WorkspaceShell>
      </NextIntlClientProvider>
    </div>
  );
}
