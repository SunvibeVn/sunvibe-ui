import { Suspense, type ReactNode } from "react";
import { hasSession } from "../session/dal";

/** Shows `children` only to visitors who are not signed in. Reads cookies only, so it never calls the backend. */
export function GuestOnly({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <GuestOnlyContent>{children}</GuestOnlyContent>
    </Suspense>
  );
}

async function GuestOnlyContent({ children }: { children: ReactNode }) {
  return (await hasSession()) ? null : children;
}
