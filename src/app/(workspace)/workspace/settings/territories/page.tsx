import type { Metadata } from "next";
import { TerritoriesView } from "@/features/owner-leads";

// The title is generic (spec 5.1).
export const metadata: Metadata = {
  title: "Territories",
};

export default function TerritoriesPage() {
  return <TerritoriesView />;
}
