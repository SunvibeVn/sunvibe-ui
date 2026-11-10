import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { devOriginsFromApiUrl } from "./src/config/dev-origins";
import { securityHeaders } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
  },
  allowedDevOrigins: devOriginsFromApiUrl(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV),
  cacheComponents: true,
  partialPrefetching: true,
  // No page is framed, and the workspace has its own image policy (SEC-M3, SV-023); every host but www is noindex (W35a
  // Task U1): see src/config/security-headers.ts.
  async headers() {
    return securityHeaders(process.env.NEXT_PUBLIC_SITE_URL);
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
