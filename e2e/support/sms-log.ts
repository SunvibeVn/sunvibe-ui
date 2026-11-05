import { expect } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The `log` SMS sender of the local API writes each message to its log (sunvibe-server scripts/dev/run-e2e-auth-api,
// auth-email-access spec A-21). The phone suites read the codes from there; a code is never printed.

const API_LOG = path.resolve(process.env.E2E_API_LOG ?? "../sunvibe-server/build/e2e-auth-api.log");
const SMS_LINE = "[DEV SMS - not sent]";

export const SMS_LOG_UNAVAILABLE_REASON =
  `The API log ${API_LOG} is missing. Start the API with sunvibe-server scripts/dev/run-e2e-auth-api on, which writes it.`;

export const isSmsLogAvailable = (): boolean => existsSync(API_LOG);

/** Where the log ends now: pass it to `nextSmsCode` to wait for a message sent after this point. */
export const smsLogPosition = (): number => statSync(API_LOG).size;

/** The 6-digit code of the first SMS logged after `position`. */
export async function nextSmsCode(position: number): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      () => {
        const added = readFileSync(API_LOG).subarray(position).toString("utf8");
        const line = added.split("\n").find((entry) => entry.includes(SMS_LINE));
        // The message comes after the masked number, which has no six digits in a row.
        code = line ? /\b(\d{6})\b/.exec(line.slice(line.indexOf(SMS_LINE)))?.[1] : undefined;
        return Boolean(code);
      },
      { message: "a new SMS was logged", timeout: 20_000 },
    )
    .toBe(true);
  return code as string;
}
