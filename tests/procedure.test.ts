import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { demoProcedure } from "../src/procedure/demo";
import { InputEventSchema, ObservationSchema, ProcedureSpecSchema, VerificationResultSchema, type InputEvent, type Observation } from "../src/procedure/schema";
import { verifyEvents } from "../src/procedure/verifier";

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

function observation(objectId: string, zone: string | null, timestampMs: number, overrides: Partial<Observation> = {}): InputEvent {
  return InputEventSchema.parse({
    type: "observation", id: `event-${timestampMs}`, timestampMs,
    observation: {
      id: `obs-${timestampMs}`, objectId, timestampMs, zone,
      quality: "observed", location: { x: 0.5, y: 0.5 }, confidence: 0.99,
      evidence: { sourceId: "synthetic-practice", timestampMs, description: "Mocked visual evidence" }, ...overrides,
    },
  });
}
function enter(object: string, target: string, t: number) {
  return [observation(object, "staging", t), observation(object, target, t + 1)];
}
const base = () => enter("blue-base", "base-target", 10);
const support = () => enter("yellow-support", "support-target", 20);
const latch = () => enter("red-latch", "latch-closed", 30);
const run = (events: InputEvent[]) => verifyEvents(demoProcedure, events);
const step = (result: ReturnType<typeof run>, id: string) => result.steps.find((s) => s.stepId === id);

describe("deterministic assembly verifier", () => {
  it("starts with base pending and later steps blocked", () => {
    expect(run([]).steps.map((s) => s.status)).toEqual(["pending", "blocked", "blocked"]);
  });
  it("passes the three ordered observed transitions and retains both evidence references", () => {
    const result = run([...base(), ...support(), ...latch()]);
    expect(result.status).toBe("passed");
    expect(result.steps.map((s) => s.verifiedAtMs)).toEqual([11, 21, 31]);
    expect(result.events.filter((e) => e.status === "passed")).toHaveLength(3);
    expect(result.events.at(-1)?.evidence.map((e) => e.timestampMs)).toEqual([30, 31]);
    expect(VerificationResultSchema.safeParse(result).success).toBe(true);
  });
  it("does not infer actions from all objects already being in target zones", () => {
    const result = run([observation("blue-base", "base-target", 10), observation("yellow-support", "support-target", 20), observation("red-latch", "latch-closed", 30)]);
    expect(result.status).toBe("needs_verification");
    expect(result.steps.every((s) => s.verifiedAtMs === null)).toBe(true);
    expect(result.events.some((e) => e.status === "failed")).toBe(false);
  });
  it("fails support installation without previously verified base", () => {
    const result = run(support());
    expect(step(result, "install-support")?.status).toBe("failed");
    expect(result.events.at(-1)?.missingPrerequisites).toEqual(["place-base"]);
  });
  it("missing base evidence remains unverified rather than inventing a base failure", () => {
    const result = run([observation("blue-base", null, 10, { quality: "missing", confidence: null, location: null })]);
    expect(result.status).toBe("needs_verification");
    expect(result.events.at(-1)?.status).toBe("needs_verification");
  });
  it("fails premature latch closure and names support with teaching recovery", () => {
    const result = run([...base(), ...latch()]);
    expect(result.status).toBe("failed");
    expect(result.events.at(-1)).toMatchObject({ status: "failed", missingPrerequisites: ["install-support"], recovery: { source: { timestampMs: 7000 } } });
    expect(result.events.at(-1)?.recovery?.instruction).toContain("Reopen");
    expect(step(result, "close-latch")?.verifiedAtMs).toBeNull();
  });
  it("enforces ordered steps even if explicit prerequisites are absent", () => {
    const spec = structuredClone(demoProcedure);
    spec.steps[1].prerequisites = [];
    expect(verifyEvents(spec, support()).events.at(-1)?.missingPrerequisites).toEqual(["place-base"]);
  });
  it("evaluates explicit forbidden rules independently of normal step prerequisites", () => {
    const spec = structuredClone(demoProcedure);
    spec.steps[2].prerequisites = [];
    expect(verifyEvents(spec, latch()).events.at(-1)?.reason).toContain("Forbidden transition");
  });
  it("does not retroactively pass a latch that was already closed too early", () => {
    const result = run([...base(), ...enter("red-latch", "latch-closed", 12), ...support(), observation("red-latch", "latch-closed", 30)]);
    expect(step(result, "close-latch")?.status).toBe("failed");
    expect(result.status).toBe("failed");
  });
  it("recovers through verified support, reopening, and a fresh closure", () => {
    const result = run([...base(), ...enter("red-latch", "latch-closed", 12), ...support(), ...latch()]);
    expect(result.events.some((e) => e.status === "failed")).toBe(true);
    expect(result.status).toBe("passed");
    expect(step(result, "close-latch")?.verifiedAtMs).toBe(31);
  });
  it("ignores exact duplicate events without advancing twice", () => {
    const events = [...base(), ...support(), ...latch()];
    const result = run([...events, ...events]);
    expect(result.events.filter((e) => e.status === "passed")).toHaveLength(3);
    expect(result.events.slice(6).every((e) => e.status === "ignored")).toBe(true);
    expect(result.status).toBe("passed");
  });
  it("ignores an identical observation wrapped in a new event ID", () => {
    const first = base()[0];
    const result = run([first, { ...first, id: "new-wrapper" }, base()[1]]);
    expect(result.events[1].reason).toBe("Duplicate observation ignored.");
    expect(result.events.filter((e) => e.status === "passed")).toHaveLength(1);
  });
  it("a duplicate cannot hide an unresolved rejected input", () => {
    const events = [...base(), ...support(), ...latch()];
    const bad = observation("blue-base", "base-target", 29);
    expect(run([...events, bad, events[5]]).status).toBe("needs_verification");
  });
  it("rejects reused event IDs with changed contents", () => {
    const first = base()[0];
    const conflict = { ...base()[1], id: first.id };
    const result = run([first, conflict]);
    expect(result.events.at(-1)?.reason).toContain("Conflicting event ID");
    expect(step(result, "place-base")?.verifiedAtMs).toBeNull();
  });
  it("rejects reused observation IDs under different event IDs", () => {
    const [first, next] = base();
    if (first.type !== "observation" || next.type !== "observation") throw new Error("Test setup");
    next.observation.id = first.observation.id;
    expect(run([first, next]).events.at(-1)?.reason).toContain("Conflicting observation ID");
    expect(step(run([first, next]), "place-base")?.status).not.toBe("passed");
  });
  it.each(["unknown", "missing", "ambiguous", "obstructed"] as const)("%s evidence never becomes success or invented failure", (quality) => {
    const result = run([base()[0], observation("blue-base", "base-target", 11, { quality })]);
    expect(result.status).toBe("needs_verification");
    expect(result.events.some((e) => e.status === "failed" || e.status === "passed")).toBe(false);
  });
  it("rejects low confidence on either side of the transition", () => {
    for (const confidenceOnBefore of [true, false]) {
      const events = [observation("blue-base", "staging", 10, { confidence: confidenceOnBefore ? 0.5 : 0.99 }), observation("blue-base", "base-target", 11, { confidence: confidenceOnBefore ? 0.99 : 0.5 })];
      expect(run(events).status).toBe("needs_verification");
    }
  });
  it("does not bridge a gap of unknown evidence to claim a transition", () => {
    const result = run([base()[0], observation("blue-base", null, 11, { quality: "unknown", confidence: null }), observation("blue-base", "base-target", 12)]);
    expect(step(result, "place-base")?.status).not.toBe("passed");
  });
  it("accepts a new clear transition after uncertainty", () => {
    expect(run([observation("blue-base", null, 1, { quality: "unknown", confidence: null }), ...base()]).steps[0].status).toBe("passed");
  });
  it("invalidates dependent progress when base exits its target", () => {
    const result = run([...base(), ...support(), ...latch(), observation("blue-base", "staging", 40)]);
    expect(result.status).toBe("needs_verification");
    expect(result.steps.every((s) => s.verifiedAtMs === null)).toBe(true);
    expect(result.steps.some((s) => s.status === "passed")).toBe(false);
  });
  it("uncertain previously verified support invalidates latch too", () => {
    const result = run([...base(), ...support(), ...latch(), observation("yellow-support", null, 40, { quality: "obstructed", confidence: null })]);
    expect(result.steps.map((s) => s.status)).toEqual(["passed", "needs_verification", "needs_verification"]);
  });
  it("an unknown zone invalidates previous verification and breaks the evidence chain", () => {
    const result = run([...base(), ...support(), ...latch(), observation("blue-base", "unmapped-zone", 40), observation("blue-base", "base-target", 41)]);
    expect(result.status).toBe("needs_verification");
    expect(result.steps.every((s) => s.verifiedAtMs === null)).toBe(true);
  });
  it("requires new downstream evidence after prerequisite loss and replacement", () => {
    const result = run([...base(), ...support(), ...latch(), observation("blue-base", "staging", 40), observation("blue-base", "base-target", 41), observation("yellow-support", "support-target", 42)]);
    expect(step(result, "install-support")?.status).toBe("needs_verification");
    expect(result.status).not.toBe("passed");
  });
  it("rejects a transition interval overlapping prerequisite verification", () => {
    const result = run([observation("yellow-support", "staging", 1), ...base(), observation("yellow-support", "support-target", 20)]);
    expect(result.events.at(-1)?.reason).toContain("overlaps");
    expect(step(result, "install-support")?.status).toBe("needs_verification");
  });
  it.each([10, 9])("rejects equal/stale timestamps (%i)", (time) => {
    const first = base()[0];
    const next = observation("blue-base", "base-target", time);
    next.id = "distinct-event";
    if (next.type === "observation") next.observation.id = "distinct-observation";
    expect(run([first, next]).events.at(-1)?.reason).toContain("strictly increasing");
  });
  it("unknown objects or zones remain unverified", () => {
    for (const event of [observation("other-object", "staging", 1), observation("blue-base", "other-zone", 1)]) {
      expect(run([event]).status).toBe("needs_verification");
      expect(run([event]).steps.every((s) => s.verifiedAtMs === null)).toBe(true);
    }
  });
  it("reset clears progress but retains event and observation deduplication", () => {
    const old = [...base(), ...support(), ...latch()];
    const reset: InputEvent = { type: "reset", id: "reset-1", timestampMs: 40 };
    const result = run([...old, reset, ...old]);
    expect(result.status).toBe("pending");
    expect(result.steps.every((s) => s.verifiedAtMs === null)).toBe(true);
    expect(run([...old, reset, ...enter("blue-base", "base-target", 50), ...enter("yellow-support", "support-target", 60), ...enter("red-latch", "latch-closed", 70)]).status).toBe("passed");
  });
  it("retry cannot itself pass a step and requires fresh evidence", () => {
    const prefix = [...base(), ...enter("red-latch", "latch-closed", 12), ...support()];
    const retry: InputEvent = { type: "retry", id: "retry-1", timestampMs: 25, stepId: "close-latch" };
    expect(step(run([...prefix, retry, observation("red-latch", "latch-closed", 26)]), "close-latch")?.status).not.toBe("passed");
    expect(run([...prefix, retry, ...latch()]).status).toBe("passed");
  });
  it("retrying a prerequisite also clears dependent steps", () => {
    const result = run([...base(), ...support(), ...latch(), { type: "retry", id: "retry-base", timestampMs: 40, stepId: "place-base" }]);
    expect(result.steps.map((s) => s.status)).toEqual(["pending", "blocked", "blocked"]);
  });
  it("unknown retry target stays unverified", () => {
    expect(run([{ type: "retry", id: "retry-x", timestampMs: 1, stepId: "no-step" }]).status).toBe("needs_verification");
  });
  it("is deterministic and never mutates input objects", () => {
    const events = [...base(), ...support(), ...latch()];
    const snapshot = JSON.stringify({ procedure: demoProcedure, events });
    expect(run(events)).toEqual(run(events));
    expect(JSON.stringify({ procedure: demoProcedure, events })).toBe(snapshot);
  });
});

describe("procedure and boundary validation", () => {
  it("rejects unapproved procedures", () => {
    expect(() => verifyEvents({ ...demoProcedure, approval: null }, [])).toThrow("human approval");
  });
  it.each([
    ["duplicate step", (p: typeof demoProcedure) => { p.steps[1].id = p.steps[0].id; }],
    ["duplicate component", (p: typeof demoProcedure) => { p.components[1].id = p.components[0].id; }],
    ["duplicate zone", (p: typeof demoProcedure) => { p.zones[1].id = p.zones[0].id; }],
    ["unknown prerequisite", (p: typeof demoProcedure) => { p.steps[1].prerequisites = ["no-step"]; }],
    ["cycle", (p: typeof demoProcedure) => { p.steps[0].prerequisites = [p.steps[2].id]; }],
    ["self prerequisite", (p: typeof demoProcedure) => { p.steps[0].prerequisites = [p.steps[0].id]; }],
    ["duplicate prerequisite", (p: typeof demoProcedure) => { p.steps[1].prerequisites.push("place-base"); }],
    ["unknown component", (p: typeof demoProcedure) => { p.steps[1].condition.componentId = "unknown"; }],
    ["unknown zone", (p: typeof demoProcedure) => { p.steps[1].condition.toZone = "unknown"; }],
    ["non-transition", (p: typeof demoProcedure) => { p.steps[1].condition.toZone = "staging"; }],
    ["invalid confidence", (p: typeof demoProcedure) => { p.steps[1].condition.minimumConfidence = 2; }],
    ["invalid source time", (p: typeof demoProcedure) => { p.steps[1].source.timestampMs = -1; }],
    ["ambiguous component mapping", (p: typeof demoProcedure) => { p.steps[1].condition.componentId = "blue-base"; }],
    ["foreign forbidden component", (p: typeof demoProcedure) => { p.steps[2].forbiddenTransitions[0].condition.componentId = "blue-base"; }],
    ["unknown forbidden prerequisite", (p: typeof demoProcedure) => { p.steps[2].forbiddenTransitions[0].unlessVerified = ["no-step"]; }],
  ])("rejects %s", (_, mutate) => {
    const spec = structuredClone(demoProcedure);
    mutate(spec);
    expect(() => verifyEvents(spec, [])).toThrow(z.ZodError);
  });
  it("rejects empty steps, unsupported condition types, and extra data", () => {
    for (const spec of [{ ...demoProcedure, steps: [] }, { ...demoProcedure, extra: true }, { ...demoProcedure, steps: [{ ...demoProcedure.steps[0], condition: { kind: "object_present" } }] }]) {
      expect(ProcedureSpecSchema.safeParse(spec).success).toBe(false);
    }
  });
  it("rejects invalid observation confidence, timestamps, geometry, or missing evidence", () => {
    const input = base()[0];
    if (input.type !== "observation") throw new Error("Test setup");
    for (const patch of [{ confidence: -0.1 }, { confidence: null }, { zone: null }, { timestampMs: -1 }, { location: { x: 2, y: 0 } }, { evidence: undefined }, { quality: "invented" }]) {
      expect(ObservationSchema.safeParse({ ...input.observation, ...patch }).success).toBe(false);
    }
    expect(() => run([{ ...input, timestampMs: 50 }])).toThrow(z.ZodError);
    expect(() => verifyEvents(demoProcedure, [{}])).toThrow(z.ZodError);
  });
});
