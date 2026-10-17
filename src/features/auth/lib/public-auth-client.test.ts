import type { Client } from "openapi-fetch";
import { describe, expect, it, vi } from "vitest";
import type { paths } from "@/api/generated/schema";
import { createPublicAuthClient } from "./public-auth-client";

const noContent = () => ({ response: new Response(null, { status: 204 }) });

describe("createPublicAuthClient (anonymous auth calls, auth-browser-session R-1)", () => {
  it("publicAuthClient_buildsTheClientLazilyAndOnce", async () => {
    const client = { POST: vi.fn(async () => noContent()) } as unknown as Client<paths>;
    const build = vi.fn(() => client);
    const run = createPublicAuthClient(build);
    expect(build).not.toHaveBeenCalled();
    await run((c) => c.POST("/api/v1/auth/password-reset/sms", { body: { phoneNumber: "0901234567" } }));
    await run((c) => c.POST("/api/v1/auth/password-reset/sms", { body: { phoneNumber: "0901234567" } }));
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("publicAuthClient_buildThrows_answersNetwork", async () => {
    const run = createPublicAuthClient(() => {
      throw new Error("missing API URL");
    });
    await expect(
      run((c) => c.POST("/api/v1/auth/password-reset/sms", { body: { phoneNumber: "0901234567" } })),
    ).resolves.toEqual({ ok: false, kind: "network" });
  });

  it("publicAuthClient_callThrows_answersNetwork", async () => {
    const run = createPublicAuthClient(() => ({}) as Client<paths>);
    await expect(
      run(() => {
        throw new Error("boom");
      }),
    ).resolves.toEqual({ ok: false, kind: "network" });
  });
});
