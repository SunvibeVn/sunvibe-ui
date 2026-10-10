import { AuthShell } from "@/features/auth";

export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return <AuthShell>{children}</AuthShell>;
}
