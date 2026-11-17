import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { NoscriptNotice } from "@/features/auth";
import { OwnerAgreementsView } from "@/features/brokerage-agreement/client";
import en from "@/i18n/messages/en.json";

export const metadata: Metadata = { title: "Brokerage agreements" };

// The page is English, as the rest of `/account`; only the session and agreement texts go to the browser.
const messages = { Session: en.Session, BrokerageAgreement: en.BrokerageAgreement };

/** The agreements are read in the browser only; the page itself never reads the session (brokerage-agreement S5-D17). */
export default function BrokerageAgreementsPage() {
  return (
    <div lang="en" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <NoscriptNotice />
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Ho_Chi_Minh">
        <OwnerAgreementsView />
      </NextIntlClientProvider>
    </div>
  );
}
