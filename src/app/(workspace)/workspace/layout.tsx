import type { Metadata } from "next";
import { WorkspaceShell } from "@/features/workspace";

// Staff pages: never indexed, and the titles stay generic (no name or code, BR-2).
export const metadata: Metadata = {
  title: "Khu làm việc",
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
