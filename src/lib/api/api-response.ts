/** Envelope every sunvibe-server endpoint answers with. */
export type ApiResponse<T> = {
  code: number;
  message?: string;
  result?: T;
};

export function unwrap<T>(response: ApiResponse<T>): T {
  if (response.result === undefined) {
    throw new Error(`API response has no result (${response.message ?? "no message"})`);
  }
  return response.result;
}
