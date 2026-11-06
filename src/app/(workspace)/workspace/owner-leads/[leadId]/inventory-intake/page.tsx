import type { Metadata } from "next";
import { Suspense } from "react";
import { IntakePage } from "@/features/inventory-intake";

// The title is generic: never a request code, an address or a name.
export const metadata: Metadata = {
  title: "Inventory intake",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

async function Intake({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  // Only the id goes to the client view; the intake is read in the browser, so the server HTML holds no intake data.
  return <IntakePage key={leadId} leadId={leadId} />;
}

export default function InventoryIntakePage({ params }: { params: Promise<{ leadId: string }> }) {
  return (
    <Suspense>
      <Intake params={params} />
    </Suspense>
  );
}
