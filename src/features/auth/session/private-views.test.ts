import { describe, expect, it } from "vitest";

import { createPrivateViewRegistry } from "./private-views";

/** A marker element: `isConnected` is false once React removed it from the document (a real unmount). */
const marker = (connected = true) => ({ isConnected: connected });

describe("private view registry (W10-29, W10-45)", () => {
  it("empty_noPrivateViewMounted", () => {
    expect(createPrivateViewRegistry().anyMounted()).toBe(false);
  });

  it("registeredMarker_staysMountedWhileItsDomIsInTheDocument", () => {
    const registry = createPrivateViewRegistry();
    const element = marker();
    registry.register(element);
    // A route kept by <Activity> is hidden, not removed: its marker is still connected.
    expect(registry.anyMounted()).toBe(true);
    element.isConnected = false;
    expect(registry.anyMounted()).toBe(false);
  });

  it("registeringTheSameMarkerTwice_countsOnce", () => {
    const registry = createPrivateViewRegistry();
    const element = marker();
    registry.register(element);
    registry.register(element);
    element.isConnected = false;
    expect(registry.anyMounted()).toBe(false);
  });

  it("anyConnectedMarker_isEnough", () => {
    const registry = createPrivateViewRegistry();
    registry.register(marker(false));
    registry.register(marker(true));
    expect(registry.anyMounted()).toBe(true);
  });
});
