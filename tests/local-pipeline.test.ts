import { expect, it } from "vitest";
import { localFixture } from "./fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import { suggestReviews } from "../src/teach/review-suggestions";
import { approveDraft } from "../src/teach/schema";
import {
  createSession,
  feedDetection,
  feedTrackingFrame,
  resumeSession,
} from "../src/practice/pipeline";
function session() {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements[0] = {
    description: "Visible transfer",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Synthetic human review",
  };
  const check = suggestReviews(local, context).transfer;
  const a = approveDraft(
    local,
    {
      reviewer: "Test",
      confirmed: true,
      goalConfirmed: true,
      steps: [
        {
          ...check,
          stepId: "transfer",
          reviewed: true,
          conditionConfirmed: true,
        },
      ],
    },
    context,
    1000,
  );
  a.procedure.zones.push({
    id: "forbidden",
    description: "Reviewed wrong destination",
  });
  a.procedure.steps[0].measurement!.forbiddenZoneIds = ["forbidden"];
  return createSession(a.procedure, [
    {
      zoneId: "origin",
      region: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.8 },
    },
    {
      zoneId: "destination",
      region: { left: 0.7, top: 0.2, right: 0.9, bottom: 0.8 },
    },
    {
      zoneId: "forbidden",
      region: { left: 0.4, top: 0.2, right: 0.55, bottom: 0.8 },
    },
  ]);
}
function detection(x: number, y = 0.5) {
  return {
    componentId: "component-1",
    quality: "observed" as const,
    center: { x, y },
    score: 0.99,
    reason: "Synthetic spatial test",
  };
}
it("a long visible continuous route remains eligible and verifies automatically with no Check action", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  for (let t = 500; t < 15000; t += 100)
    feedDetection(s, detection(0.6, 0.9), t);
  for (let t = 15000; t <= 15500; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
  expect(s.result.steps[0].verifiedAtMs).toBe(15000);
});
it("an approach forecast is advisory before fresh evidence confirms a forbidden destination", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  feedDetection(s, detection(0.34), 500);
  const approaching = feedDetection(s, detection(0.38), 600);
  expect(approaching.warning?.stepId).toBe("transfer");
  expect(s.result.steps[0].status).not.toBe("failed");
  for (let t = 700; t <= 1200; t += 100) feedDetection(s, detection(0.48), t);
  expect(s.result.steps[0].status).toBe("failed");
});
it("cannot pass while still travelling within a broad target; only this object's endpoint dwell matters", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  feedDetection(s, detection(0.6, 0.9), 500);
  for (let t = 600; t <= 1200; t += 100) {
    feedDetection(s, detection(0.72 + ((t - 600) / 100) * 0.02), t);
    expect(s.result.status).not.toBe("passed");
  }
  for (let t = 1300; t <= 1600; t += 100) feedDetection(s, detection(0.84), t);
  expect(s.result.status).toBe("passed");
  expect(s.result.steps[0].verifiedAtMs).toBe(1200);
});
it("partial identity permits continuous transit but cannot verify an endpoint or invent a reversal", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  const partial = {
    componentId: "component-1",
    quality: "observed" as const,
    identityOnly: true,
    visibleFraction: 0.7,
    center: null,
    score: 0.99,
    reason: "Partial body; no complete geometry",
  };
  for (let t = 500; t <= 1500; t += 100) {
    feedDetection(s, partial, t);
    expect(s.result.status).not.toBe("passed");
  }
  for (let t = 1600; t <= 2000; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
  // Partial view of a verified object: retained, never a reversal
  // (2026-11-04 contract: only a clear observation elsewhere undoes a step).
  feedDetection(s, partial, 2100);
  expect(s.result.status).toBe("passed");
  expect(s.result.events.at(-1)?.decision).not.toBe("reversal");
  for (let t = 2200; t <= 2600; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
  expect(s.result.steps[0].verifiedAtMs).toBe(1600);
});
it("automatically establishes the initial view before allowing progress, with automatic recovery from an early move", () => {
  const s = session();
  feedDetection(s, detection(0.2), 0);
  feedDetection(s, detection(0.2), 100);
  feedDetection(s, detection(0.8), 200);
  expect(s.armed).toBe(false);
  expect(s.result.status).not.toBe("passed");
  for (let t = 300; t <= 700; t += 100) feedDetection(s, detection(0.2), t);
  expect(s.armed).toBe(true);
  expect(s.result.status).toBe("pending");
  for (let t = 800; t <= 1200; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
});
it("confirms adjacent physical actions while the learner and another object keep moving", () => {
  const first = session(),
    p = structuredClone(first.procedure);
  p.components.push({ id: "component-2", description: "Second native object" });
  const second = structuredClone(p.steps[0]);
  second.id = "second";
  second.condition.componentId = "component-2";
  second.prerequisites = ["transfer"];
  p.steps.push(second);
  p.execution!.goalStepIds = ["transfer", "second"];
  p.execution!.requirements[0].stepIds = ["transfer", "second"];
  const s = createSession(p, first.bindings);
  for (let t = 0; t <= 1300; t += 100) {
    feedDetection(s, detection(t >= 500 ? 0.8 : 0.2, 0.35), t);
    feedDetection(
      s,
      { ...detection(t >= 800 ? 0.8 : 0.2, 0.65), componentId: "component-2" },
      t,
    );
    if (t === 900) expect(s.result.steps[0].status).toBe("passed");
  }
  expect(s.result.steps.map((step) => step.verifiedAtMs)).toEqual([500, 800]);
  expect(s.result.status).toBe("passed");
});
it("resumes with fresh current-state evidence, retaining completed actions and their original physical times", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  for (let t = 500; t <= 900; t += 100) feedDetection(s, detection(0.8), t);
  const priorEvents = s.events.length;
  s.stopped = true;
  resumeSession(s, s.bindings, 1000);
  expect(s.initialZones["component-1"]).toBe("destination");
  // Resuming loses sight of nothing physical: the completed action is kept.
  expect(s.result.status).toBe("passed");
  for (let t = 1100; t <= 1500; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
  expect(s.result.steps[0].verifiedAtMs).toBe(500);
  expect(s.calibrations).toHaveLength(2);
  expect(s.events.length).toBeGreaterThan(priorEvents);
  // A clear reversal after resume still fails.
  for (let t = 1600; t <= 2200; t += 100) feedDetection(s, detection(0.2), t);
  expect(s.result.steps[0].status).toBe("failed");
});
it("does not let resume infer an unfinished action from a target already present", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  feedDetection(s, detection(0.6, 0.9), 500);
  s.stopped = true;
  resumeSession(s, s.bindings, 1000);
  for (let t = 1100; t <= 1500; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).not.toBe("passed");
  expect(s.armed).toBe(false);
  for (let t = 1600; t <= 2000; t += 100) feedDetection(s, detection(0.2), t);
  for (let t = 2100; t <= 2500; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
});
it("retains the completed target requirement after an uncertainty-triggered pause", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  for (let t = 500; t <= 900; t += 100) feedDetection(s, detection(0.8), t);
  feedDetection(
    s,
    {
      componentId: "component-1",
      quality: "missing",
      score: null,
      center: null,
      reason: "Obstructed",
    },
    1000,
  );
  s.stopped = true;
  resumeSession(s, s.bindings, 1100);
  expect(s.initialZones["component-1"]).toBe("destination");
  for (let t = 1200; t <= 1600; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
});
it("rejects invalid resume mappings before changing session state", () => {
  const s = session();
  s.stopped = true;
  expect(() => resumeSession(s, [], 1000)).toThrow();
  expect(s.calibrations).toHaveLength(1);
  expect(s.stopped).toBe(true);
});
it("the shared frame adapter rejects empty, duplicate and contradictory identity sets", () => {
  const s = session(),
    reading = {
      objectId: "component-1",
      quality: "observed" as const,
      score: 0.99,
      box: { left: 0.15, top: 0.4, right: 0.25, bottom: 0.6 },
    };
  const frame = {
    timestampMs: 0,
    frameId: "f",
    calibrationValid: true,
    detections: [reading],
    partialIdentities: [],
  };
  expect(() => feedTrackingFrame(s, { ...frame, detections: [] })).toThrow(
    "every approved identity",
  );
  expect(() =>
    feedTrackingFrame(s, { ...frame, detections: [reading, reading] }),
  ).toThrow("every approved identity");
  expect(() =>
    feedTrackingFrame(s, {
      ...frame,
      partialIdentities: [
        { objectId: "component-1", score: 0.99, visibleFraction: 0.7 },
      ],
    }),
  ).toThrow("partial identity");
});
it("the shared browser/replay adapter uses the approved base point and fails closed on unavailable calibration", () => {
  const fixture = session(),
    p = structuredClone(fixture.procedure);
  p.steps[0].measurement!.point = "bottom_center";
  const bindings = structuredClone(fixture.bindings);
  bindings.find((b) => b.zoneId === "destination")!.region = {
    left: 0.7,
    top: 0.65,
    right: 0.9,
    bottom: 0.8,
  };
  const s = createSession(p, bindings);
  for (let t = 0; t <= 900; t += 100)
    feedTrackingFrame(s, {
      timestampMs: t,
      frameId: `f-${t}`,
      calibrationValid: true,
      partialIdentities: [],
      detections: [
        {
          objectId: "component-1",
          quality: "observed",
          score: 0.99,
          box:
            t < 500
              ? { left: 0.15, top: 0.25, right: 0.25, bottom: 0.45 }
              : { left: 0.75, top: 0.2, right: 0.85, bottom: 0.7 },
        },
      ],
    });
  expect(s.result.status).toBe("passed");
  feedTrackingFrame(s, {
    timestampMs: 1000,
    frameId: "invalid-calibration",
    calibrationValid: false,
    partialIdentities: [],
    detections: [
      {
        objectId: "component-1",
        quality: "observed",
        score: 0.99,
        box: { left: 0.75, top: 0.2, right: 0.85, bottom: 0.7 },
      },
    ],
  });
  // Unavailable calibration is no evidence at all: nothing new is verified
  // or reversed; the earlier verified action is retained.
  expect(s.result.status).toBe("passed");
  expect(s.result.events.at(-1)?.status).not.toBe("passed");
});

it("a clear reversal after temporary uncertainty still invalidates a maintained verified action", () => {
  const s = session();
  for (let t = 0; t <= 400; t += 100) feedDetection(s, detection(0.2), t);
  for (let t = 500; t <= 1000; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
  feedDetection(
    s,
    { ...detection(0.8), quality: "missing", center: null, score: null },
    1100,
  );
  expect(s.result.status).toBe("passed"); // uncertainty is not a reversal
  for (let t = 1200; t <= 1800; t += 100) feedDetection(s, detection(0.2), t);
  expect(s.result.steps[0].status).toBe("failed");
  expect(s.result.events.some((e) => e.decision === "reversal")).toBe(true);
  for (let t = 1900; t <= 2400; t += 100) feedDetection(s, detection(0.8), t);
  expect(s.result.status).toBe("passed");
  expect(s.result.events.at(-1)?.decision).toBe("restoration");
});
