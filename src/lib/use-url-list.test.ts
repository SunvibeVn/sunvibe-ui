import { describe, expect, it } from "vitest";

import { type ListOutcome, type ListUrl, listOnScreen, nextListState, readListUrl, startListRead } from "./use-url-list";

type State = { scope: "mine" | "all"; ward?: string; page: number };

/** The rules both lists follow: a tab the viewer may not open becomes the default, a ward exists on "all" only. */
const urlFor = (tabs: readonly State["scope"][]): ListUrl<State> => ({
  parse(params) {
    const raw = params.get("scope");
    const scope = raw === "all" && tabs.includes("all") ? "all" : "mine";
    const page = Number(params.get("page") ?? "1");
    const ward = scope === "all" ? params.get("ward") : null;
    return ward === null ? { scope, page } : { scope, ward, page };
  },
  serialize(state) {
    const params = new URLSearchParams({ scope: state.scope });
    if (state.ward !== undefined) params.set("ward", state.ward);
    if (state.page > 1) params.set("page", String(state.page));
    return params.toString();
  },
});

const leader = urlFor(["mine", "all"]);
const sale = urlFor(["mine"]);

type Page = { items: string[] };
type Outcome = ListOutcome<Page, string>;

/** A read whose answer the test gives by hand. */
function deferred() {
  let answer: (outcome: Outcome) => void = () => undefined;
  const promise = new Promise<Outcome>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

describe("nextListState", () => {
  it("nextListState_filterChange_resetsThePage", () => {
    expect(nextListState({ scope: "all", ward: "20194", page: 4 }, leader)).toEqual({ scope: "all", ward: "20194", page: 1 });
  });

  it("nextListState_aTabTheViewerMayNotOpen_becomesTheirDefault: a SALE never reaches a URL with scope all (W11-23)", () => {
    expect(nextListState({ scope: "all", ward: "20194", page: 1 }, sale)).toEqual({ scope: "mine", page: 1 });
  });
});

describe("readListUrl", () => {
  it("backNavigation_restoresTheFilters: the URL alone gives back the state, with nothing to replace", () => {
    const filtered: State = { scope: "all", ward: "20194", page: 3 };
    const back = readListUrl(leader.serialize(filtered), leader);
    expect(back.state).toEqual(filtered);
    expect(back.normalized).toBe(true);
  });

  it("readListUrl_aUrlThatIsNotNormalized_namesTheOneToReplaceItWith", () => {
    const read = readListUrl("scope=all&ward=20194", sale);
    expect(read.canonical).toBe("scope=mine");
    expect(read.normalized).toBe(false);
  });
});

describe("startListRead", () => {
  const start = (load: () => Promise<Outcome>, currentUser = "U1") => {
    const landed: unknown[] = [];
    const stop = startListRead({
      userId: "U1",
      key: "scope=mine",
      load,
      currentUser: () => currentUser,
      onAnswer: (loaded) => landed.push(loaded),
    });
    return { landed, stop };
  };

  it("startListRead_answerStands_landsWithItsUserAndUrl", async () => {
    const read = deferred();
    const { landed } = start(() => read.promise);
    read.answer({ kind: "page", page: { items: ["L1"] } });
    await read.promise;
    expect(landed).toEqual([{ userId: "U1", key: "scope=mine", outcome: { kind: "page", page: { items: ["L1"] } } }]);
  });

  it("staleResponse_isIgnored: an answer that arrives after a newer URL or a hidden route never lands", async () => {
    const read = deferred();
    const { landed, stop } = start(() => read.promise);
    stop();
    read.answer({ kind: "page", page: { items: ["L1"] } });
    await read.promise;
    expect(landed).toEqual([]);
  });

  it("startListRead_anotherUserSignedIn_dropsTheAnswer", async () => {
    const read = deferred();
    const { landed } = start(() => read.promise, "U2");
    read.answer({ kind: "page", page: { items: ["L1"] } });
    await read.promise;
    expect(landed).toEqual([]);
  });
});

describe("listOnScreen", () => {
  const page: Page = { items: ["L1"] };
  const loaded = { userId: "U1", key: "scope=mine", outcome: { kind: "page", page } as Outcome };

  it("listOnScreen_answerOfThisUserAndUrl_isReady", () => {
    expect(listOnScreen(loaded, { userId: "U1", canonical: "scope=mine", normalized: true })).toEqual({
      page,
      status: { kind: "ready", page },
    });
  });

  it("listOnScreen_answerOfAnotherUrl_isNotShown", () => {
    expect(listOnScreen(loaded, { userId: "U1", canonical: "scope=all", normalized: true })).toEqual({
      page: null,
      status: { kind: "loading" },
    });
  });

  it("listOnScreen_answerOfAnotherUser_isNotShown", () => {
    expect(listOnScreen(loaded, { userId: "U2", canonical: "scope=mine", normalized: true })).toEqual({
      page: null,
      status: { kind: "loading" },
    });
  });

  it("listOnScreen_aUrlNotNormalizedYet_waitsWithThePageAtHand: the filters still read its rows", () => {
    expect(listOnScreen(loaded, { userId: "U1", canonical: "scope=mine", normalized: false })).toEqual({
      page,
      status: { kind: "loading" },
    });
  });

  it("listOnScreen_aFailedRead_saysWhy", () => {
    const failed = { ...loaded, outcome: { kind: "error", error: "retry" } as Outcome };
    expect(listOnScreen(failed, { userId: "U1", canonical: "scope=mine", normalized: true })).toEqual({
      page: null,
      status: { kind: "error", error: "retry" },
    });
  });

  it("listOnScreen_nothingLoaded_isLoading", () => {
    expect(listOnScreen(null, { userId: "U1", canonical: "scope=mine", normalized: true })).toEqual({
      page: null,
      status: { kind: "loading" },
    });
  });
});
