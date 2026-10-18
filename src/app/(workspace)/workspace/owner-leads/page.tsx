import type { Metadata } from "next";
import { LeadListView } from "@/features/owner-leads";

// The title is generic: no owner data or staff name in titles (BR-2).
export const metadata: Metadata = {
  title: "Lead nguồn hàng",
};

export default function OwnerLeadsPage() {
  return <LeadListView />;
}
