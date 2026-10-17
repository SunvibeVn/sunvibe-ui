import { afterEach, describe, expect, it, vi } from "vitest";

class FakeChannel {
  static created: FakeChannel[] = [];
  readonly posted: unknown[] = [];
  constructor(readonly name: string) {
    FakeChannel.created.push(this);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
}

async function loadFresh() {
  vi.resetModules();
  return import("./auth-channel");
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeChannel.created = [];
});

describe("auth channel (W10-33)", () => {
  it("getAuthChannel_createsOneSvAuthChannelLazily", async () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const { getAuthChannel, AUTH_CHANNEL_NAME } = await loadFresh();
    expect(FakeChannel.created).toHaveLength(0);
    const channel = getAuthChannel();
    expect(getAuthChannel()).toBe(channel);
    expect(FakeChannel.created).toHaveLength(1);
    expect(AUTH_CHANNEL_NAME).toBe("sv-auth");
    expect(FakeChannel.created[0]?.name).toBe("sv-auth");
  });

  it("getAuthChannel_withoutBroadcastChannel_isNull", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { getAuthChannel, broadcastAuth } = await loadFresh();
    expect(getAuthChannel()).toBeNull();
    expect(() => broadcastAuth({ type: "signed-out", generation: null })).not.toThrow();
  });

  it("broadcastAuth_postsOnlyTypeAndGeneration", async () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const { broadcastAuth } = await loadFresh();
    const message = { type: "signed-in" as const, generation: "gen-1", accessToken: "secret" };
    broadcastAuth(message);
    expect(FakeChannel.created[0]?.posted).toEqual([{ type: "signed-in", generation: "gen-1" }]);
  });
});
