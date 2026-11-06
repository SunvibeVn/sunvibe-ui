import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { NoscriptNotice } from "@/features/auth";
import { PropertyConfirmationsSection } from "@/features/inventory-intake/client";
import en from "@/i18n/messages/en.json";

export const metadata: Metadata = { title: "Property confirmations" };

// The page is English, as the rest of `/account`; only its own texts go to the browser, not the staff ones.
const messages = {
  Session: en.Session,
  InventoryIntake: { account: en.InventoryIntake.account, assetType: en.InventoryIntake.assetType },
};

/** The requests are read in the browser only; the page itself never reads the session. */
export default function PropertyConfirmationsPage() {
  return (
    <div lang="en" className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <NoscriptNotice />
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Ho_Chi_Minh">
        <PropertyConfirmationsSection />
      </NextIntlClientProvider>
    </div>
  );
}
