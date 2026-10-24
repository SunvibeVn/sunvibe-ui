import type { Metadata } from "next";
import { SurveyListView } from "@/features/surveys";

// The title is generic: no owner data or staff name in titles (BR-2).
export const metadata: Metadata = {
  title: "Surveys",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

export default function SurveysPage() {
  return <SurveyListView />;
}
