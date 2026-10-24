import type { Metadata } from "next";
import { TerritoriesView } from "@/features/owner-leads";

// The title is generic (spec 5.1).
export const metadata: Metadata = {
  title: "Territories",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

export default function TerritoriesPage() {
  return <TerritoriesView />;
}
