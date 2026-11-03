import { expect, it, vi } from "vitest";
import {
  evaluatePredicate,
  initialGoal,
  updateGoal,
  isProcedureComplete,
  type GoalObservation,
} from "../src/procedure/goal";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { localExecutionDraft } from "../src/teach/local-execution";
import { createSession, feedTrackingFrame } from "../src/practice/pipeline";
import { watchSet } from "../src/practice/watch-set";
import type { ProcedureSpec } from "../src/procedure/schema";

vi.mock("server-only", () => ({}));
const policy = { freshMs: 600, minConfidence: 0.9, holdMs: 400 };
const zone = { destination: { left: 0.6, top: 0.3, right: 0.9, bottom: 0.7 } };
const box = (x: number, y = 0.5, w = 0.06) => ({
  left: x - w / 2,
  top: y - 0.04,
  right: x + w / 2,
  bottom: y + 0.04,
});
const obs = (
  x: number,
  t = 1000,
  extra: Partial<GoalObservation> = {},
): GoalObservation => ({
  timestampMs: t,
  quality: "observed",
  confidence: 0.97,
  box: box(x),
  ...extra,
});
const inZone = {
  id: "goal",
  kind: "object_in_zone" as const,
  objectId: "a",
  zoneId: "destination",
  evidenceFrames: [1],
};
const sep = {
  id: "apart",
  kind: "projected_separation" as const,
  objectId: "a",
  otherObjectId: "b",
  minimumGap: 0.1,
  evidenceFrames: [1],
};
const at = (
  latest: Record<string, GoalObservation>,
  p: Parameters<typeof evaluatePredicate>[0] = inZone,
  now = 1100,
) => evaluatePredicate(p, latest, zone, now, policy).verdict;

it("object_in_zone: pass with fresh evidence, fail outside, unknown when ambiguous, stale or only near (1-5)", () => {
  expect(at({ a: obs(0.75) })).toBe("pass");
  expect(at({ a: obs(0.2) })).toBe("fail");
  expect(at({ a: obs(0.75, 1000, { quality: "ambiguous" }) })).toBe("unknown");
  expect(at({ a: obs(0.75, 1000, { confidence: 0.5 }) })).toBe("unknown");
  expect(at({ a: obs(0.75, 100) })).toBe("unknown"); // stale (1 s old)
  expect(at({ a: obs(0.6) })).toBe("unknown"); // on the boundary: near is not inside
  expect(at({})).toBe("unknown");
});
it("projected_separation: pass, fail on reliable small gap, unknown when ambiguous (6-8)", () => {
  expect(at({ a: obs(0.2), b: obs(0.5) }, sep)).toBe("pass");
  expect(at({ a: obs(0.2), b: obs(0.25) }, sep)).toBe("fail");
  expect(
    at(
      { a: obs(0.2), b: obs(0.5, 1000, { box: null, quality: "missing" }) },
      sep,
    ),
  ).toBe("unknown");
});
it("unsupported or incomplete predicates never pass (9)", () => {
  expect(at({ a: obs(0.75) }, { id: "x", kind: "contact" } as never)).toBe(
    "unknown",
  );
  expect(at({ a: obs(0.75) }, { ...inZone, zoneId: "nowhere" })).toBe(
    "unknown",
  );
});

/** Single-transfer V3 lesson whose final predicate is the object in "destination". */
function lesson(revision = "a".repeat(64)) {
  const { draft, context } = teachV3Fixture();
  const local = localExecutionDraft(draft, "Transfer", context);
  const procedure: ProcedureSpec = {
    ...local.procedure,
    approval: { reviewer: "T", timestampMs: 1, revision },
  };
  return procedure;
}
const bindings = [
  {
    zoneId: "origin",
    region: { left: 0.05, top: 0.3, right: 0.3, bottom: 0.65 },
  },
  {
    zoneId: "destination",
    region: { left: 0.4, top: 0.3, right: 0.65, bottom: 0.65 },
  },
];
let t = 10_000;
function frame(
  session: ReturnType<typeof createSession>,
  x: number | null,
  options: { at?: number } = {},
) {
  t = options.at ?? t + 100;
  return feedTrackingFrame(session, {
    timestampMs: t,
    frameId: `f${t}`,
    calibrationValid: true,
    partialIdentities: [],
    watchKey: watchSet(session.procedure, session.result).key,
    detections: [
      {
        objectId: "component-1",
        quality: x === null ? "ambiguous" : "observed",
        box: x === null ? null : box(x, 0.47),
        score: x === null ? null : 0.97,
      },
    ],
  });
}
const hold = (s: ReturnType<typeof createSession>, x: number | null, n = 8) => {
  for (let i = 0; i < n; i++) frame(s, x);
};
const complete = (s: ReturnType<typeof createSession>) =>
  isProcedureComplete(
    s.procedure,
    s.goal,
    s.result.steps.every((x) => x.status === "passed"),
  );

it("completes only after every step passes AND the final goal holds on fresh evidence (10, 11, 15, 16)", () => {
  const s = createSession(lesson(), bindings);
  hold(s, 0.175); // origin
  expect(s.goal.status).toBe("incomplete");
  frame(s, 0.525);
  frame(s, 0.525);
  const statuses = new Set<string>();
  for (let i = 0; i < 10; i++) {
    frame(s, 0.525);
    statuses.add(s.goal.status);
  }
  expect(statuses.has("verifying_goal")).toBe(true); // momentary observation is not completion
  expect(s.goal.status).toBe("complete");
  expect(complete(s)).toBe(true);
  hold(s, 0.525, 10); // remains true
  expect(s.goal.status).toBe("complete");
  expect(s.goal.audit.filter((e) => e.type === "complete")).toHaveLength(1); // (24)
});
it("all steps passed but goal unknown or failing keeps the procedure incomplete (10, 11)", () => {
  const goal = updateGoal(initialGoal(lesson()), {
    procedure: lesson(),
    stepsPassed: true,
    latest: {},
    zones: {},
    nowMs: 1,
    unresolvedIdentities: [],
    sessionReady: true,
  });
  expect(goal.status).toBe("verifying_goal");
  const failing = updateGoal(initialGoal(lesson()), {
    procedure: lesson(),
    stepsPassed: true,
    latest: { "component-1": obs(0.1) },
    zones: Object.fromEntries(bindings.map((b) => [b.zoneId, b.region])),
    nowMs: 1000,
    unresolvedIdentities: [],
    sessionReady: true,
  });
  expect(failing.status).toBe("verifying_goal");
  expect(isProcedureComplete(lesson(), failing, true)).toBe(false);
});
it("goal passing with an incomplete step, unresolved identity or paused session is not complete (12-14)", () => {
  const p = lesson();
  const base = {
    procedure: p,
    latest: { "component-1": obs(0.525) },
    zones: Object.fromEntries(bindings.map((b) => [b.zoneId, b.region])),
    nowMs: 1100,
  };
  const g = (extra: object) =>
    updateGoal(
      { ...initialGoal(p), passSinceMs: 0 },
      {
        ...base,
        stepsPassed: true,
        unresolvedIdentities: [],
        sessionReady: true,
        ...extra,
      },
    );
  expect(g({ stepsPassed: false }).status).toBe("incomplete");
  expect(g({ unresolvedIdentities: ["component-1"] }).status).toBe(
    "verifying_goal",
  );
  expect(g({ sessionReady: false }).status).toBe("verifying_goal");
  expect(g({}).status).toBe("complete");
});
it("a reliable reversal invalidates completion and is audited without erasing step history (17, 21)", () => {
  const s = createSession(lesson(), bindings);
  hold(s, 0.175);
  hold(s, 0.525, 12);
  expect(s.goal.status).toBe("complete");
  const passedBefore = s.result.events.filter(
    (e) => e.status === "passed",
  ).length;
  hold(s, 0.175, 6); // visibly moved back out of the destination
  expect(complete(s)).toBe(false);
  expect(["invalidated"]).toContain(s.goal.status);
  expect(s.goal.audit.filter((e) => e.type === "invalidated")).toHaveLength(1); // once (24)
  expect(
    s.result.events.filter((e) => e.status === "passed").length,
  ).toBeGreaterThanOrEqual(passedBefore);
});
it("unknown evidence after completion does not invalidate it (18)", () => {
  const s = createSession(lesson(), bindings);
  hold(s, 0.175);
  hold(s, 0.525, 12);
  hold(s, null, 3); // hand over the object
  expect(s.goal.audit.some((e) => e.type === "invalidated")).toBe(false);
});
it("a stale (older) reply cannot reverse a newer completion (19)", () => {
  const s = createSession(lesson(), bindings);
  hold(s, 0.175);
  hold(s, 0.525, 12);
  const completedAt = t;
  frame(s, 0.175, { at: completedAt - 50 }); // older timestamp
  expect(s.goal.status).toBe("complete");
  const stale = feedTrackingFrame(s, {
    timestampMs: t + 100,
    frameId: "old-rev",
    calibrationValid: true,
    partialIdentities: [],
    watchKey: "v3|0|old|",
    detections: [],
  });
  expect(stale.stale).toBe(true);
  expect(s.goal.status).toBe("complete");
});
it("after invalidation, completion returns only through fresh verified evidence (20)", () => {
  const s = createSession(lesson(), bindings);
  hold(s, 0.175);
  hold(s, 0.525, 12);
  hold(s, 0.175, 6);
  hold(s, 0.525, 12);
  expect(complete(s)).toBe(true);
  expect(s.goal.audit.map((e) => e.type)).toEqual([
    "complete",
    "invalidated",
    "complete",
  ]);
});
it("completion is tied to the approved revision and never inherited by a changed one (22, 23)", () => {
  const s = createSession(lesson("a".repeat(64)), bindings);
  hold(s, 0.175);
  hold(s, 0.525, 12);
  expect(s.goal.audit[0].revision).toBe("a".repeat(64));
  const changed = updateGoal(s.goal, {
    procedure: lesson("b".repeat(64)),
    stepsPassed: false,
    latest: s.latest,
    zones: {},
    nowMs: t + 100,
    unresolvedIdentities: [],
    sessionReady: true,
  });
  expect(changed.status).toBe("incomplete");
  expect(changed.audit).toEqual([]);
});
it("normal verification needs no model call (25)", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const s = createSession(lesson(), bindings);
  hold(s, 0.175);
  hold(s, 0.525, 12);
  expect(fetchSpy).not.toHaveBeenCalled();
});
