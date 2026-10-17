import { AuthCard, NoscriptNotice } from "@/features/auth";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthCard>
      <NoscriptNotice />
      {children}
    </AuthCard>
  );
}
