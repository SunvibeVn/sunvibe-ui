/** True when `iso` (an ISO time from auth-service) is still ahead; false when missing or past. */
export function isFuture(iso?: string): boolean {
  return iso !== undefined && Date.parse(iso) > Date.now();
}
