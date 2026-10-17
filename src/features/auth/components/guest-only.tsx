import { Suspense, type ReactNode } from "react";
import { hasSignInHint } from "../session/hint.server";

/** Shows `children` only to visitors who are not signed in. Reads the sign-in hint cookie only, so it never calls the backend. */
export function GuestOnly({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <GuestOnlyContent>{children}</GuestOnlyContent>
    </Suspense>
  );
}

async function GuestOnlyContent({ children }: { children: ReactNode }) {
  return (await hasSignInHint()) ? null : children;
}
