import type { Metadata } from "next";
import { Suspense } from "react";
import { CaseDetailView } from "@/features/inventory-intake";

// The title is generic: never a lead code, an address or a name.
export const metadata: Metadata = {
  title: "Inventory case",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

async function InventoryCase({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetailView key={caseId} caseId={caseId} />;
}

export default function InventoryCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  return (
    <Suspense>
      <InventoryCase params={params} />
    </Suspense>
  );
}
