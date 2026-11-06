import type { Metadata } from "next";
import { CaseListView } from "@/features/inventory-intake";

// The title is generic: never a lead code, an address or a name.
export const metadata: Metadata = {
  title: "Inventory cases",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

export default function InventoryCasesPage() {
  return <CaseListView />;
}
