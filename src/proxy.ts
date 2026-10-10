import type { NextRequest } from "next/server";
import { authProxy } from "@/features/auth/proxy";

export function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  matcher: [
    // Every page and Server Action, but not Next.js internals, metadata images or static files.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|opengraph-image|twitter-image|images/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
};
