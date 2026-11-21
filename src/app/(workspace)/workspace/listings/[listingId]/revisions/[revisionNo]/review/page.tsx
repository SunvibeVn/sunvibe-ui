import type { Metadata } from "next";
import { Suspense } from "react";
import { RevisionReviewView } from "@/features/listing-publish";

// The title is generic: never a code, a unit or a name.
export const metadata: Metadata = {
  title: "Listing review",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

type Params = Promise<{ listingId: string; revisionNo: string }>;

async function Review({ params }: { params: Params }) {
  const { listingId, revisionNo } = await params;
  return <RevisionReviewView key={`${listingId}/${revisionNo}`} listingId={listingId} revisionNo={revisionNo} />;
}

export default function ListingReviewPage({ params }: { params: Params }) {
  return (
    <Suspense>
      <Review params={params} />
    </Suspense>
  );
}
