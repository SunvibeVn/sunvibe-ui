import { AuthCard } from "@/features/auth";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <AuthCard>{children}</AuthCard>;
}
