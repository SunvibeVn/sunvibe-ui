import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewQueueView } from "@/features/listing-publish";

export const metadata: Metadata = {
  title: "Listing reviews",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

export default function ListingReviewsPage() {
  return (
    <Suspense>
      <ReviewQueueView />
    </Suspense>
  );
}
