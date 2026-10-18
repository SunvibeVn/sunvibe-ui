import { describe, expect, it } from "vitest";
import { devOriginsFromApiUrl } from "./dev-origins";

describe("devOriginsFromApiUrl", () => {
  it("allows the host of a LAN API url, so the dev server serves its own assets to a phone", () => {
    expect(devOriginsFromApiUrl("http://192.168.1.12:8081", "development")).toEqual(["192.168.1.12"]);
  });

  it("allows nothing for the default local API", () => {
    expect(devOriginsFromApiUrl("http://localhost:8081", "development")).toEqual([]);
    expect(devOriginsFromApiUrl("http://127.0.0.1:8081", "development")).toEqual([]);
  });

  it("allows nothing when the url is missing or not a url", () => {
    expect(devOriginsFromApiUrl(undefined, "development")).toEqual([]);
    expect(devOriginsFromApiUrl("", "development")).toEqual([]);
    expect(devOriginsFromApiUrl("not a url", "development")).toEqual([]);
  });

  it("allows nothing in production", () => {
    expect(devOriginsFromApiUrl("https://api.sunvibe.vn", "production")).toEqual([]);
  });
});
