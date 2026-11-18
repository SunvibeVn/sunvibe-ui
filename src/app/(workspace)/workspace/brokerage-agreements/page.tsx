import type { Metadata } from "next";
import { Suspense } from "react";
import { AgreementListView } from "@/features/brokerage-agreement";

// The title is generic: never a unit code, an address or a name.
export const metadata: Metadata = {
  title: "Brokerage agreements",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

// The list reads its filters and page from the address (`useSearchParams`), which needs a Suspense boundary.
export default function BrokerageAgreementsPage() {
  return (
    <Suspense>
      <AgreementListView />
    </Suspense>
  );
}
