import { expect, it } from "vitest";
import { demoProcedure } from "../src/procedure/demo";
import { ProcedureSpecSchema } from "../src/procedure/schema";
import { createSession, feedTrackingFrame, resumeSession } from "../src/practice/pipeline";

const towel = { left: 0.1, top: 0.5, right: 0.5, bottom: 0.9 },
  mat = { left: 0.55, top: 0.5, right: 0.9, bottom: 0.9 };
function procedure() {
  const value = structuredClone(demoProcedure);
  value.steps = [value.steps[0]];
  value.components = value.components.filter((c) => c.id === "blue-base");
  value.execution = {
    schemaVersion: 2,
    goal: "Bowl on the mat",
    goalStepIds: [value.steps[0].id],
    requirements: [{ description: "Observed transfer", status: "covered", stepIds: [value.steps[0].id], reason: "Human reviewed transfer" }],
  };
  value.steps[0].measurement = {
    method: "zone_transition", point: "center", maximumPositionDrift: 0.01, minimumFreshFrames: 3,
    stableForMs: 400, maxObservationGapMs: 600, persistence: "maintain", releaseStepId: null,
    reversalRecovery: "restore_target", forbiddenZoneIds: [], sourceFrames: { start: 0, change: 1, result: 2 },
  };
  return ProcedureSpecSchema.parse(value);
}
const bindings = [{ zoneId: "staging", region: towel }, { zoneId: "base-target", region: mat }];
const at = (cx: number, cy = 0.7) => ({ left: cx - 0.05, top: cy - 0.05, right: cx + 0.05, bottom: cy + 0.05 });
let n = 0;
function frame(session: ReturnType<typeof createSession>, t: number, cx: number | null) {
  feedTrackingFrame(session, {
    timestampMs: t, frameId: `f${n++}`, calibrationValid: true,
    detections: [cx === null
      ? { objectId: "blue-base", quality: "occluded", box: null, score: null }
      : { objectId: "blue-base", quality: "observed", box: at(cx), score: 0.95 }],
    partialIdentities: [], identityEvents: [],
  } as Parameters<typeof feedTrackingFrame>[1]);
}
function armedSession() {
  const s = createSession(procedure(), bindings, 0);
  let t = 0;
  for (let i = 0; i < 12; i++) frame(s, (t += 66), 0.3);
  expect(s.armed).toBe(true);
  return { s, t };
}
function stallAndResume(s: ReturnType<typeof createSession>, t: number) {
  s.stopped = true; // supervisor halt: evidence arrived too late
  t += 8000;
  resumeSession(s, bindings, t, "source_alignment");
  return t;
}

it("recovery keeps an observed move: the bowl last seen on the goal is not sent back to the start", () => {
  const a = armedSession();
  const s = a.s;
  let t = a.t;
  for (const cx of [0.35, 0.45, 0.6, 0.7, 0.72]) frame(s, (t += 66), cx);
  expect(s.result.steps[0].status).not.toBe("passed"); // stalled before the dwell
  t = stallAndResume(s, t);
  expect(s.initialZones["blue-base"]).toBe("base-target");
  for (let i = 0; i < 20; i++) frame(s, (t += 66), 0.72);
  expect(s.armed).toBe(true);
  expect(s.result.steps[0].status).toBe("passed");
});

it("recovery keeps a verified step and still detects a later reversal", () => {
  const a = armedSession();
  const s = a.s;
  let t = a.t;
  for (const cx of [0.35, 0.45, 0.6, 0.7]) frame(s, (t += 66), cx);
  for (let i = 0; i < 15; i++) frame(s, (t += 66), 0.72);
  expect(s.result.steps[0].status).toBe("passed");
  t = stallAndResume(s, t);
  for (let i = 0; i < 12; i++) frame(s, (t += 66), 0.72);
  expect(s.armed).toBe(true);
  expect(s.result.steps[0].status).toBe("passed");
  for (const cx of [0.6, 0.45, 0.3]) frame(s, (t += 66), cx);
  for (let i = 0; i < 12; i++) frame(s, (t += 66), 0.3);
  expect(s.result.events.some((e) => e.status === "failed")).toBe(true);
});

it("an unobserved move during the stall is not credited: last seen at the start, it must be observed there", () => {
  const a = armedSession();
  const s = a.s;
  let t = a.t;
  t = stallAndResume(s, t);
  expect(s.initialZones["blue-base"]).toBe("staging");
  for (let i = 0; i < 20; i++) frame(s, (t += 66), 0.72); // already on the goal
  expect(s.armed).toBe(false);
  expect(s.result.steps[0].status).not.toBe("passed");
});
