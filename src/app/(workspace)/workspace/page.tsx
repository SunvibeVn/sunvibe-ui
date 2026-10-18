import { redirect } from "next/navigation";
import { WORKSPACE_HOME } from "@/features/workspace";

/** The workspace has no page of its own: the lead queue is its home. */
export default function WorkspacePage() {
  redirect(WORKSPACE_HOME);
}
