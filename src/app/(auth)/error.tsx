"use client";

import { AuthError } from "@/features/auth/client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AuthError retry={retry} />;
}
