import type { Metadata } from "next";
import { Suspense } from "react";
import { AgreementDetailView } from "@/features/brokerage-agreement";

// The title is generic: never a unit code, an address or a name.
export const metadata: Metadata = {
  title: "Brokerage agreement",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

async function BrokerageAgreement({ params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  return <AgreementDetailView key={agreementId} agreementId={agreementId} />;
}

export default function BrokerageAgreementPage({ params }: { params: Promise<{ agreementId: string }> }) {
  return (
    <Suspense>
      <BrokerageAgreement params={params} />
    </Suspense>
  );
}
