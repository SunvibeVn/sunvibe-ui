import type { Metadata } from "next";
import { Suspense } from "react";
import { ReconfirmationListView } from "@/features/listing-publish";

export const metadata: Metadata = {
  title: "Listings to reconfirm",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

export default function ReconfirmationsPage() {
  return (
    <Suspense>
      <ReconfirmationListView />
    </Suspense>
  );
}
