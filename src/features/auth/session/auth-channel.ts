// The tab's channel for sign-in and sign-out news between tabs of this browser (auth-browser-session §4.5). It
// carries only the message type and the sign-in generation id, never a token.

export const AUTH_CHANNEL_NAME = "sv-auth";

export type AuthMessage = { type: "signed-in" | "signed-out"; generation: string | null };

let channel: BroadcastChannel | undefined;

/** The one `BroadcastChannel("sv-auth")` of this tab, created on first use; null where the browser has none. */
export function getAuthChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  return channel;
}

/** Posts `{ type, generation }` and nothing else. Best effort: a closed or missing channel is ignored. */
export function broadcastAuth(message: AuthMessage): void {
  try {
    getAuthChannel()?.postMessage({ type: message.type, generation: message.generation });
  } catch {
    // Other tabs still catch up on focus, visibilitychange and pageshow.
  }
}
