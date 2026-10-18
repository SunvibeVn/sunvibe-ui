import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { devOriginsFromApiUrl } from "./src/config/dev-origins";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  allowedDevOrigins: devOriginsFromApiUrl(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV),
  cacheComponents: true,
  partialPrefetching: true,
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
