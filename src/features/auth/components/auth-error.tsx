"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Body of the route error boundaries under (auth), (onboarding) and (platform). */
export function AuthError({ retry }: { retry: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="error" title="Something went wrong">
        We couldn&apos;t load this page. Please try again in a moment.
      </Alert>
      <Button variant="secondary" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
