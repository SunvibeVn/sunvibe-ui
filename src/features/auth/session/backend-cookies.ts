/** Value of cookie `name` among a response's Set-Cookie headers; undefined if absent or cleared. */
export function readSetCookie(setCookieHeaders: string[], name: string): string | undefined {
  for (const header of setCookieHeaders) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator === -1 || pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return value === "" ? undefined : value;
  }
  return undefined;
}
