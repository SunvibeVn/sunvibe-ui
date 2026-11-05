import { expect } from "@playwright/test";

// The local inbox of the auth E2E runs (sunvibe-server scripts/dev/run-e2e-auth-api, auth-email-access spec A-21): Mailpit
// on 127.0.0.1:8025, which exists only for these runs. Nothing here logs a code or a link.

const MAILPIT_URL = "http://127.0.0.1:8025";

export const MAILPIT_UNAVAILABLE_REASON =
  `Mailpit not reachable at ${MAILPIT_URL}. Start the API with sunvibe-server scripts/dev/run-e2e-auth-api, which starts it.`;

let probe: Promise<boolean> | undefined;

/** True when the inbox answers; probed once per worker. */
export function isMailpitAvailable(): Promise<boolean> {
  probe ??= fetch(`${MAILPIT_URL}/api/v1/info`, { signal: AbortSignal.timeout(3_000) })
    .then((response) => response.ok)
    .catch(() => false);
  return probe;
}

type MessageSummary = { ID: string };
type Message = { Text: string; HTML: string };

async function messageIdsTo(address: string): Promise<string[]> {
  const query = new URLSearchParams({ query: `to:"${address}"`, limit: "50" });
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?${query}`);
  expect(response.ok, "Mailpit search").toBe(true);
  const { messages } = (await response.json()) as { messages: MessageSummary[] };
  return messages.map((message) => message.ID);
}

/** How many mails `address` has received: pass it to `nextMailTo` to wait for the one after them. */
export const mailCountTo = async (address: string): Promise<number> => (await messageIdsTo(address)).length;

/** Waits for mail number `after + 1` to `address` (newest first in Mailpit) and returns its text and HTML. */
export async function nextMailTo(address: string, after = 0): Promise<Message> {
  let ids: string[] = [];
  await expect
    .poll(
      async () => {
        ids = await messageIdsTo(address);
        return ids.length;
      },
      { message: "a new mail arrived", timeout: 20_000 },
    )
    .toBeGreaterThan(after);
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${ids[0]}`);
  expect(response.ok, "Mailpit message").toBe(true);
  return (await response.json()) as Message;
}

/** The code of a plain-text mail (registration, bind). */
export function codeOf(mail: Message): string {
  const code = /\b(\d{6})\b/.exec(mail.Text)?.[1];
  if (!code) throw new Error("The mail holds no 6-digit code");
  return code;
}

/** The code and the link of a reset mail, which is HTML. */
export function resetOf(mail: Message): { code: string; link: string } {
  const code = /class="otp">(\d{6})</.exec(mail.HTML)?.[1];
  const link = /href="([^"]*\/reset-password#token=[^"]+)"/.exec(mail.HTML)?.[1];
  if (!code || !link) throw new Error("The mail holds no reset code or link");
  return { code, link };
}
