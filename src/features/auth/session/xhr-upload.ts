// One body upload through XMLHttpRequest (survey-media PD-11: fetch offers no upload progress), used only by
// `uploadWithBearer` of the api client, so the access token never leaves the auth module (ADR-001). Credentials are
// omitted; a stall (no progress for `stallMs`), a network error or a refused connection is `network` (state unknown
// for the caller); an abort of any of `signals` is `aborted`.

/** The part of XMLHttpRequest the upload uses (a test passes a scripted one). */
export interface UploadXhr {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
  getResponseHeader(name: string): string | null;
  addEventListener(type: "load" | "error" | "abort" | "progress" | "timeout", listener: () => void): void;
  readonly status: number;
  readonly responseText: string;
  withCredentials: boolean;
  readonly upload: {
    addEventListener(type: "progress", listener: (event: { loaded: number; total: number; lengthComputable: boolean }) => void): void;
  };
}

export type XhrAnswer =
  | { kind: "answer"; status: number; body: unknown; headers: Headers }
  | { kind: "network" }
  | { kind: "aborted" };

export type XhrRequest = {
  method: "PUT";
  url: string;
  token: string;
  body: Blob;
  headers: Readonly<Record<string, string>>;
  onProgress?: (sent: number, total: number) => void;
  stallMs: number;
  signals: readonly AbortSignal[];
};

/** Headers of the answer the browser lets the page read (CORS exposed), for the result mapping. */
const READ_HEADERS = ["Retry-After", "X-Correlation-Id", "Idempotent-Replayed"] as const;

function parseBody(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Sends once; never throws. */
export function sendXhr(createXhr: () => UploadXhr, request: XhrRequest): Promise<XhrAnswer> {
  return new Promise<XhrAnswer>((resolve) => {
    if (request.signals.some((signal) => signal.aborted)) {
      resolve({ kind: "aborted" });
      return;
    }
    let xhr: UploadXhr;
    try {
      xhr = createXhr();
    } catch {
      resolve({ kind: "network" });
      return;
    }
    let settled = false;
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (answer: XhrAnswer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const signal of request.signals) signal.removeEventListener("abort", stop);
      resolve(answer);
    };
    const armStall = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        xhr.abort();
        finish({ kind: "network" });
      }, request.stallMs);
    };
    function stop() {
      xhr.abort();
      finish({ kind: "aborted" });
    }

    try {
      xhr.open(request.method, request.url);
      xhr.withCredentials = false;
      for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
      // Set last: the caller's headers cannot replace it.
      xhr.setRequestHeader("Authorization", `Bearer ${request.token}`);
      xhr.upload.addEventListener("progress", (event) => {
        armStall();
        if (event.lengthComputable) request.onProgress?.(event.loaded, event.total);
      });
      xhr.addEventListener("progress", armStall);
      xhr.addEventListener("load", () => {
        const { status } = xhr;
        if (status < 200 || status > 599) {
          finish({ kind: "network" });
          return;
        }
        const headers = new Headers();
        for (const name of READ_HEADERS) {
          const value = xhr.getResponseHeader(name);
          if (value !== null) headers.set(name, value);
        }
        finish({ kind: "answer", status, body: parseBody(xhr.responseText), headers });
      });
      xhr.addEventListener("error", () => finish({ kind: "network" }));
      xhr.addEventListener("timeout", () => finish({ kind: "network" }));
      xhr.addEventListener("abort", () => finish(stalled ? { kind: "network" } : { kind: "aborted" }));
      for (const signal of request.signals) signal.addEventListener("abort", stop, { once: true });
      armStall();
      xhr.send(request.body);
    } catch {
      finish({ kind: "network" });
    }
  });
}
