import { Alert } from "@/components/ui/alert";
import type { SessionTexts } from "./session-screens";

type SessionEndedProps = { texts: SessionTexts; loginHref: string };

/** The 401 screen, shown while the page leaves for the login page. */
export function SessionEnded({ texts, loginHref }: SessionEndedProps) {
  return (
    <div className="space-y-4 py-6">
      <Alert tone="info" title={texts.expiredTitle}>
        {texts.expiredBody}
      </Alert>
      <a href={loginHref} className="text-sm font-semibold text-violet-700 hover:underline">
        {texts.expiredLink}
      </a>
    </div>
  );
}
