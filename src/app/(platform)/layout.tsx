import { SiteShell } from "@/components/layout/site-shell";
import { UserMenu } from "@/features/auth";

export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return <SiteShell headerActions={<UserMenu />}>{children}</SiteShell>;
}
