import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadDetailView } from "@/features/owner-leads";

// The title is generic: never the request code or a name (BR-2, W11-41).
export const metadata: Metadata = {
  title: "Lead",
};

async function OwnerLeadDetail({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  // Only the id goes to the client view; the lead is read in the browser after hydration, so the server HTML holds no
  // owner data or staff name. `key` starts a clean view when the id changes (a link to another lead).
  return <LeadDetailView key={leadId} leadId={leadId} />;
}

export default function OwnerLeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  return (
    <Suspense>
      <OwnerLeadDetail params={params} />
    </Suspense>
  );
}
