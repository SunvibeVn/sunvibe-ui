/**
 * Headers that tell auth-service who the real client is. Behind the BFF every
 * request comes from the Next.js server, so without these the backend's rate
 * limits, lockouts and audit log would treat all users as one (spec §8).
 */
export function forwardedHeaders(source: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const userAgent = source.get("user-agent");
  if (userAgent) result["User-Agent"] = userAgent;
  const clientIp = source.get("x-forwarded-for") ?? source.get("x-real-ip");
  if (clientIp) result["X-Forwarded-For"] = clientIp;
  return result;
}
