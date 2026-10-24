import type { Metadata } from "next";
import { LeadListView } from "@/features/owner-leads";

// The title is generic: no owner data or staff name in titles (BR-2).
export const metadata: Metadata = {
  title: "Supply Leads",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

export default function OwnerLeadsPage() {
  return <LeadListView />;
}
