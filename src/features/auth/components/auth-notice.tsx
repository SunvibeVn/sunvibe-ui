import { Alert } from "@/components/ui/alert";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** One-off messages carried in the URL by redirects (`?reset=success`, `?session=expired`). */
export async function AuthNotice({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (params.reset === "success") {
    return <Alert tone="success">Your password has been reset. Log in with your new password.</Alert>;
  }
  if (params.session === "expired") {
    return <Alert tone="info">Your session has ended. Please log in again.</Alert>;
  }
  return null;
}
