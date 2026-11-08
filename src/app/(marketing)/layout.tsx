import { SiteShell } from "@/components/layout/site-shell";
import { UserMenu } from "@/features/auth/public";
import { WorkspaceLink } from "@/features/workspace/public";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
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
