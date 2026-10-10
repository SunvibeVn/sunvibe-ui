"use client";

import { AuthError } from "@/features/auth/client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <AuthError retry={retry} />
    </div>
  );
}
