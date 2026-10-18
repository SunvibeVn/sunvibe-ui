/**
 * The Google Maps directions link for a lead's coordinates (spec 5.4, C-22). The workspace opens it only on a click;
 * nothing is requested from Google before that.
 */
export function mapDirectionsUrl(lat: number | string, lng: number | string): string {
  const part = (value: number | string) => encodeURIComponent(String(value).trim());
  return `https://www.google.com/maps/dir/?api=1&destination=${part(lat)},${part(lng)}`;
}
