import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingDetailView } from "@/features/listing-publish";

// The title is generic: never a code, a unit or a name.
export const metadata: Metadata = {
  title: "Listing",
};

// The workspace shell renders this page only once the browser has the session: no instant navigation to validate.
export const instant = false;

async function Listing({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <ListingDetailView key={listingId} listingId={listingId} />;
}

export default function ListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  return (
    <Suspense>
      <Listing params={params} />
    </Suspense>
  );
}
