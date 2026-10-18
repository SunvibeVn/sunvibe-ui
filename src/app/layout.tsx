import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { SessionProvider } from "@/features/auth";
import { DraftSessionSync } from "@/features/owner-leads/client";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Share images come from opengraph-image.jpg and twitter-image.jpg in this
// folder, which Next.js adds to the <head> automatically.
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.title, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    // No `url` here: with it, Next treats the metadata of every dynamic-route page (workspace lead detail) as runtime
    // data and the build fails (Cache Components, "runtime data in generateMetadata()").
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: siteConfig.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // One app-wide locale (vi, D-15); lang follows it (ADR-008).
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <SessionProvider>
            {/* Drops the workspace drafts on any sign-out or user change, wherever it happens (SEC-M2). */}
            <DraftSessionSync />
            {children}
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
