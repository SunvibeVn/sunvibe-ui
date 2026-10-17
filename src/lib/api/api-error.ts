export type FieldError = { field: string; message: string; allowedValues?: string[] };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
    /** Seconds from the `Retry-After` header (423 locked, 429 rate limited). */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Per-field messages of a validation error body: `{ errors: [{ field, message }] }`. */
  get fieldErrors(): FieldError[] {
    if (!this.body || typeof this.body !== "object" || !("errors" in this.body)) return [];
    const { errors } = this.body;
    if (!Array.isArray(errors)) return [];
    return errors.filter(
      (error): error is FieldError =>
        typeof error?.field === "string" && typeof error?.message === "string",
    );
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isNotFound() {
    return this.status === 404;
  }
}
