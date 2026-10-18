import { SiteShell } from "@/components/layout/site-shell";
import { UserMenu } from "@/features/auth";
import { WorkspaceLink } from "@/features/workspace";

export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return (
    <SiteShell
      headerActions={
        <>
          <WorkspaceLink />
          <UserMenu />
        </>
      }
    >
      {children}
    </SiteShell>
  );
}
