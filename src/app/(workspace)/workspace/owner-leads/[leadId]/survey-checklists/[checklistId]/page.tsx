import type { Metadata } from "next";
import { Suspense } from "react";
import { ChecklistPage } from "@/features/owner-leads";

// The title is generic: never the request code, an address or a name (survey-checklist spec 4.10).
export const metadata: Metadata = {
  title: "Survey checklist",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

async function SurveyChecklist({ params }: { params: Promise<{ leadId: string; checklistId: string }> }) {
  const { leadId, checklistId } = await params;
  // Only the ids go to the client view; the checklist is read in the browser after hydration, so the server HTML holds
  // no survey data or staff name. `key` starts a clean view when the checklist changes.
  return <ChecklistPage key={checklistId} leadId={leadId} checklistId={checklistId} />;
}

export default function SurveyChecklistPage({ params }: { params: Promise<{ leadId: string; checklistId: string }> }) {
  return (
    <Suspense>
      <SurveyChecklist params={params} />
    </Suspense>
  );
}
