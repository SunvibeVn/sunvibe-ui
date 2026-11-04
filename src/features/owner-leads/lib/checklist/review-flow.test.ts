import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { ChecklistDecided, ChecklistSubmitted, ChecklistUiError, ChecklistView } from "@/features/surveys";
import type { FieldError } from "@/lib/api";

import { emptyContent, viewOf } from "./fixtures.test-support";
import { runDecision, runSubmit } from "./review-flow";
import { afterDecision, EMPTY_REVIEW_FORM, reviewAccess, type ReviewForm } from "./review-model";

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data, status: 200, replayed: false, correlationId: "c" });
const http = (status: number, code?: string, fieldErrors: FieldError[] = []): ApiResult<never> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors,
  correlationId: undefined,
});

const submitted = viewOf(emptyContent(), 1, { status: "SUBMITTED", review: { canReview: true, decisionBlockedBy: [] } });
const decided = viewOf(emptyContent(), 1, {
  status: "PASSED",
  decision: { outcome: "PASSED", reviewer: { userId: "U2", name: "Binh Leader" } },
});

/** Runs the flow against fakes and records what it did, in order. */
async function decide(answer: ApiResult<ChecklistDecided>, readAnswer: ChecklistView | null = submitted) {
  const steps: string[] = [];
  const result = await runDecision({
    send: async () => {
      steps.push("send");
      return answer;
    },
    apply: () => {
      steps.push("apply");
    },
    read: async () => {
      steps.push("read");
      return readAnswer;
    },
    pageFailure: async (error: ChecklistUiError) => {
      steps.push(`page:${error.kind}`);
    },
  });
  return { result, steps };
}

describe("runDecision (spec 9.5: the decision commits before its answer is built)", () => {
  it("applies the revision of a 200 and reads nothing", async () => {
    const { result, steps } = await decide(ok({ checklist: decided }));
    expect(result).toEqual({ kind: "decided" });
    expect(steps).toEqual(["send", "apply"]);
  });

  it("a 5xx with a decision standing is no error: the read answers for it", async () => {
    const { result, steps } = await decide(http(500), decided);
    expect(result).toEqual({ kind: "already-decided" });
    // A newer read may own the screen and fail: the decision reaches it from this answer.
    expect(steps).toEqual(["send", "read", "apply"]);
  });

  it("a lost answer with a decision standing is no error either", async () => {
    const { result } = await decide({ ok: false, kind: "network" }, decided);
    expect(result).toEqual({ kind: "already-decided" });
  });

  it("a 5xx without a decision is a failure, shown after the read", async () => {
    const { result, steps } = await decide(http(500), submitted);
    expect(result).toMatchObject({ kind: "failed", error: { kind: "retry" } });
    expect(steps).toEqual(["send", "read"]);
  });

  it("a 5xx whose read fails leaves the outcome unknown", async () => {
    const { result } = await decide(http(502), null);
    expect(result).toMatchObject({ kind: "unknown", error: { kind: "retry" } });
  });

  it("a 409 on a stale version reads first: another reviewer may have decided", async () => {
    expect((await decide(http(409, "CONCURRENT_MODIFICATION"), decided)).result).toEqual({ kind: "already-decided" });
    expect((await decide(http(409, "CONCURRENT_MODIFICATION"), submitted)).result).toMatchObject({ kind: "failed", error: { kind: "stale" } });
  });

  it("a refusal by a rule names the rules once the read shows no decision", async () => {
    const { result, steps } = await decide(
      http(409, "CHECKLIST_DECISION_NOT_ALLOWED", [{ field: "evidence.unavailable", message: "x" }]),
      submitted,
    );
    expect(result).toEqual({ kind: "failed", error: { kind: "decision-not-allowed", rules: ["EVIDENCE_UNAVAILABLE"] } });
    expect(steps).toEqual(["send", "read"]);
  });

  it("the refusals of the page go to the page, without a second read here", async () => {
    for (const [answer, kind] of [
      [http(403, "CHECKLIST_REVIEW_NOT_ALLOWED", [{ field: "reviewer", message: "x" }]), "review-not-allowed"],
      [http(403), "forbidden"],
      [http(404), "not-found"],
      [http(400, "VALIDATION_FAILED", [{ field: "reason", message: "x" }]), "validation"],
    ] as const) {
      const { result, steps } = await decide(answer);
      expect(result).toMatchObject({ kind: "failed", error: { kind } });
      expect(steps).toEqual(["send", `page:${kind}`]);
    }
  });

  it("I-1: a refusal whose read ends the viewer's review keeps the typed form in reach", async () => {
    const typed: ReviewForm = { ...EMPTY_REVIEW_FORM, outcome: "NEEDS_CHANGES", reason: "Bring the land paper" };
    const held = viewOf(emptyContent(), 1, {
      status: "SUBMITTED",
      review: { canReview: false, reason: "LEAD_STATUS", decisionBlockedBy: [] },
    });
    const { result } = await decide(http(409, "CHECKLIST_DECISION_NOT_ALLOWED", [{ field: "lead.status", message: "x" }]), held);
    expect(result.kind).toBe("failed");
    expect(afterDecision(typed, result)).toBe(typed);
    expect(reviewAccess(held, typed)).toBe("blocked");
  });
});

async function submit(answer: ApiResult<ChecklistSubmitted>) {
  const steps: string[] = [];
  const result = await runSubmit({
    send: async () => {
      steps.push("send");
      return answer;
    },
    apply: () => {
      steps.push("apply");
    },
    read: async () => {
      steps.push("read");
    },
    pageFailure: async (error: ChecklistUiError) => {
      steps.push(`page:${error.kind}`);
    },
  });
  return { result, steps };
}

describe("runSubmit (spec 6.1, A-4)", () => {
  it("applies the frozen revision", async () => {
    const { result, steps } = await submit(ok({ checklist: submitted, historyEntry: { type: "CHECKLIST_SUBMITTED" } as never }));
    expect(result).toEqual({ kind: "saved" });
    expect(steps).toEqual(["send", "apply"]);
  });

  it("a replay answers 200 with no History row and is a success too (A-4)", async () => {
    const { result, steps } = await submit(ok({ checklist: submitted, historyEntry: null }));
    expect(result).toEqual({ kind: "saved" });
    expect(steps).toEqual(["send", "apply"]);
  });

  it("a gate that refuses reads again, so the panel shows what is true now", async () => {
    const { result, steps } = await submit(http(409, "CHECKLIST_NOT_READY", [{ field: "media.pending", message: "x" }]));
    expect(result).toEqual({ kind: "failed", error: { kind: "not-ready", gates: ["PHOTOS_NOT_FINISHED"] } });
    expect(steps).toEqual(["send", "read"]);
  });

  it("the switches and a stale version read again as well", async () => {
    expect((await submit(http(409, "CHECKLIST_SUBMISSION_NOT_AVAILABLE"))).steps).toEqual(["send", "read"]);
    expect((await submit(http(409, "CONCURRENT_MODIFICATION"))).steps).toEqual(["send", "read"]);
  });

  it("a failed answer changes nothing: sending again is safe (A-4)", async () => {
    const { result, steps } = await submit(http(500));
    expect(result).toMatchObject({ kind: "failed", error: { kind: "retry" } });
    expect(steps).toEqual(["send"]);
  });

  it("the refusals of the page go to the page", async () => {
    const { steps } = await submit(http(409, "CHECKLIST_READ_ONLY"));
    expect(steps).toEqual(["send", "page:read-only"]);
  });

  it("a 200 without a revision is a failure", async () => {
    const { result } = await submit(ok({}));
    expect(result).toMatchObject({ kind: "failed", error: { kind: "retry" } });
  });
});
