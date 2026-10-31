import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { compileGuide, CompilerOutputSchema } from "../src/guide/compile";
import { GuideSchema } from "../src/guide/schema";
import { AnalysisDraftSchema, primaryIssue } from "../src/guide/draft";
import { approveGuide } from "../src/server/guide/http";
import type { TeachContext } from "../src/teach/schema";

const secret = "guide-draft-test-token-at-least-32-characters";
beforeEach(() => {
  vi.stubEnv("TEACH_ACCESS_TOKEN", secret);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Paid network forbidden");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function source(): TeachContext {
  return {
    lesson: {
      lessonId: "ab86b72d-935c-4bbf-8363-71553ed1893a",
      media: {
        info: {
          container: "mp4",
          mime: "video/mp4",
          bytes: 100,
          durationSeconds: 1.2,
          video: { codec: "avc", width: 640, height: 480, frames: 12, fps: 10 },
          audio: { codec: "aac", sampleRate: 24000, channels: 1 },
        },
        frameTimesMs: Array.from({ length: 12 }, (_, i) => i * 100),
      },
      transcript: {
        text: "Move the package.",
        durationMs: 1200,
        turns: [{ startMs: 0, endMs: 1100, text: "Move the package." }],
      },
    },
    selections: [
      {
        id: "component-1",
        description: "Package",
        frame: 0,
        mark: { kind: "point", x: 100, y: 100 },
      },
    ],
    tracking: [
      {
        componentId: "component-1",
        missingFrames: 0,
        samples: Array.from({ length: 12 }, (_, i) => ({
          frame: i,
          timestampMs: i * 100,
          confidence: 0.99,
          maskPixels: 1000,
          box: {
            left: 0.1 + i * 0.02,
            top: 0.2,
            right: 0.3 + i * 0.02,
            bottom: 0.4,
          },
        })),
      },
    ],
  };
}
function output(): z.infer<typeof CompilerOutputSchema> {
  return {
    title: "Move a package",
    goal: "Package moved aside",
    initialInstruction: "Show the package.",
    methodName: "Demonstrated",
    objects: [
      {
        id: "component-1",
        label: "Package",
        description: "Physical package",
        initiallyVisible: true,
      },
    ],
    steps: [
      {
        id: "move",
        instruction: "Move the package aside.",
        explanation: "Observed displacement",
        correction: "Return to start and try again.",
        objectId: "component-1",
        anchorId: null,
        kind: "movement",
        requiredVisibleAfter: ["component-1"],
        startFrame: 0,
        changeFrame: 5,
        endFrame: 10,
        turnIds: [0],
        uncertainties: [],
      },
    ],
    coverage: [
      { instruction: "Move package", status: "included", reason: "Shown" },
    ],
    goalFrame: 10,
    goalStepIds: ["move"],
  };
}

it("returns a reviewable draft instead of losing the lesson when geometry is unreliable", () => {
  const context = source();
  for (const sample of context.tracking[0].samples) sample.confidence = 0.5;
  const result = compileGuide(output(), context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  expect(result.draftVersion).toBe(1);
  expect(result.approval).toBeNull();
  expect(result.objects[0].sourceBox).toBeNull();
  expect(result.objects[0].unresolved).toMatchObject({
    objectId: "component-1",
    code: "no_reliable_geometry",
    candidateFrame: 0,
    checkedSamples: 12,
    bestScore: 0.5,
  });
  expect(result.objects[0].unresolved?.message).toContain("Package");
  expect(AnalysisDraftSchema.safeParse(result).success).toBe(true);
  expect(GuideSchema.safeParse(result).success).toBe(false);
  expect(primaryIssue(result).code).toBe("no_reliable_geometry");
  expect(primaryIssue(result).message.length).toBeLessThanOrEqual(300);
});

it("keeps an invalid step interval as an unresolved draft step with no invented evidence", () => {
  const raw = output();
  raw.steps[0].endFrame = 1000;
  const result = compileGuide(raw, source());
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  expect(result.steps[0].evidence).toBeNull();
  expect(result.steps[0].supported).toBe(false);
  expect(result.steps[0].unresolved).toHaveLength(1);
  expect(result.steps[0].unresolved[0].code).toBe("invalid_interval");
});

it("records unknown object references and unusable rules without executing them", () => {
  const unknown = output();
  unknown.steps[0].objectId = "component-9";
  const unknownResult = compileGuide(unknown, source());
  expect("draftVersion" in unknownResult).toBe(true);
  if (!("draftVersion" in unknownResult)) throw new Error("Expected a draft.");
  expect(unknownResult.steps[0].condition).toBeNull();
  expect(unknownResult.steps[0].unresolved[0].code).toBe("unknown_object");

  const rule = output();
  rule.steps[0].kind = "separation";
  rule.steps[0].anchorId = null;
  const ruleResult = compileGuide(rule, source());
  expect("draftVersion" in ruleResult).toBe(true);
  if (!("draftVersion" in ruleResult)) throw new Error("Expected a draft.");
  expect(ruleResult.steps[0].unresolved[0].code).toBe("invalid_condition");
});

it("flags demonstrated steps proposed out of order", () => {
  const raw = output();
  raw.steps.push({
    ...raw.steps[0],
    id: "again",
    startFrame: 1,
    changeFrame: 2,
    endFrame: 3,
  });
  const result = compileGuide(raw, source());
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const flagged = result.steps.find((s) => s.id === "again");
  expect(flagged?.supported).toBe(false);
  expect(flagged?.unresolved.map((u) => u.code)).toContain("invalid_order");
});

it("records which frames break continuity, with timestamps and reasons", () => {
  const context = source();
  context.tracking[0].samples = context.tracking[0].samples.filter(
    (s) => s.frame !== 4 && s.frame !== 5,
  );
  for (const s of context.tracking[0].samples) s.confidence = 0.5;
  const result = compileGuide(output(), context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const gap = result.steps[0].unresolved.find(
    (u) => u.code === "discontinuous_tracking",
  );
  expect(gap?.failedFrames).toBe(11);
  expect(gap?.frames?.[0]).toEqual({
    frame: 0,
    timestampMs: 0,
    reason: "low_score",
  });
  expect(gap?.frames?.[4]).toEqual({
    frame: 4,
    timestampMs: 400,
    reason: "missing",
  });
  expect(AnalysisDraftSchema.safeParse(result).success).toBe(true);
});

it("caps recorded frames but keeps the true failing total", () => {
  const context = source();
  context.lesson.media.frameTimesMs = Array.from(
    { length: 100 },
    (_, i) => i * 100,
  );
  context.lesson.media.info.durationSeconds = 10;
  context.tracking[0].samples = Array.from({ length: 100 }, (_, i) => ({
    frame: i,
    timestampMs: i * 100,
    confidence: 0.5,
    maskPixels: 1000,
    box: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 },
  }));
  const raw = output();
  raw.steps[0].endFrame = 99;
  raw.goalFrame = 99;
  const result = compileGuide(raw, context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const gap = result.steps[0].unresolved.find(
    (u) => u.code === "discontinuous_tracking",
  );
  expect(gap?.failedFrames).toBe(100);
  expect(gap?.frames).toHaveLength(60);
});

it("records unobserved endpoints and absent result objects", () => {
  const context = source();
  context.tracking[0].samples = context.tracking[0].samples.filter(
    (s) => s.frame !== 0,
  );
  context.selections.push({
    id: "component-2",
    description: "Tray",
    frame: 10,
    mark: { kind: "point", x: 10, y: 10 },
  });
  context.tracking.push({
    componentId: "component-2",
    missingFrames: 12,
    samples: [],
  });
  const raw = output();
  raw.objects.push({
    id: "component-2",
    label: "Tray",
    description: "Tray",
    initiallyVisible: false,
  });
  raw.steps[0].requiredVisibleAfter = ["component-1", "component-2"];
  const result = compileGuide(raw, context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const change = result.steps[0].unresolved.find(
    (u) => u.code === "metric_unavailable",
  );
  expect(change?.frames).toEqual([
    { frame: 0, timestampMs: 0, reason: "missing", objectId: "component-1" },
  ]);
  expect(change?.failedFrames).toBe(1);
  const visibility = result.steps[0].unresolved.find(
    (u) => u.code === "missing_required_visibility",
  );
  expect(visibility?.objectIds).toEqual(["component-2"]);
});

it("lists failing frames in time order across involved objects", () => {
  const context = source();
  for (const s of context.tracking[0].samples)
    if (s.frame >= 8 && s.frame <= 10) s.confidence = 0.5;
  context.selections.push({
    id: "component-2",
    description: "Tray",
    frame: 0,
    mark: { kind: "point", x: 10, y: 10 },
  });
  context.tracking.push({
    componentId: "component-2",
    missingFrames: 12,
    samples: [],
  });
  const raw = output();
  raw.objects.push({
    id: "component-2",
    label: "Tray",
    description: "Tray",
    initiallyVisible: false,
  });
  raw.steps[0].kind = "separation";
  raw.steps[0].anchorId = "component-2";
  const result = compileGuide(raw, context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const gap = result.steps[0].unresolved.find(
    (u) => u.code === "discontinuous_tracking",
  );
  expect(gap?.frames?.map((f) => f.frame)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(gap?.failedFrames).toBe(11);
});

it("records the measured change when one was computed but unusable", () => {
  const context = source();
  for (const s of context.tracking[0].samples)
    s.box = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 };
  const raw = output();
  raw.steps.push({
    ...raw.steps[0],
    id: "again",
    startFrame: 1,
    changeFrame: 2,
    endFrame: 3,
  });
  const result = compileGuide(raw, context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const change = result.steps[0].unresolved.find(
    (u) => u.code === "insufficient_change",
  );
  expect(change?.measuredChange).toBe(0);
  expect(change?.frames).toBeUndefined();
  expect(AnalysisDraftSchema.safeParse(result).success).toBe(true);
});

it("blames an unreliable anchor endpoint instead of reporting no action", () => {
  const context = source();
  context.selections.push({
    id: "component-2",
    description: "Tray",
    frame: 0,
    mark: { kind: "point", x: 10, y: 10 },
  });
  context.tracking.push({
    componentId: "component-2",
    missingFrames: 12,
    samples: [],
  });
  const raw = output();
  raw.objects.push({
    id: "component-2",
    label: "Tray",
    description: "Tray",
    initiallyVisible: false,
  });
  raw.steps[0].kind = "separation";
  raw.steps[0].anchorId = "component-2";
  const result = compileGuide(raw, context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const change = result.steps[0].unresolved.find(
    (u) => u.code === "metric_unavailable",
  );
  expect(change?.frames).toEqual([
    { frame: 0, timestampMs: 0, reason: "missing", objectId: "component-2" },
    {
      frame: 10,
      timestampMs: 1000,
      reason: "missing",
      objectId: "component-2",
    },
  ]);
  expect(change?.failedFrames).toBe(2);
});

it("distinguishes an implausibly large jump from a small move", () => {
  const context = source();
  const start = { left: 0.1, top: 0.2, right: 0.12, bottom: 0.22 };
  const end = { left: 0.9, top: 0.2, right: 0.92, bottom: 0.22 };
  for (const s of context.tracking[0].samples)
    s.box = s.frame === 10 ? end : start;
  context.selections.push({
    id: "component-2",
    description: "Tray",
    frame: 0,
    mark: { kind: "point", x: 10, y: 10 },
  });
  context.tracking.push({
    componentId: "component-2",
    missingFrames: 12,
    samples: [],
  });
  const raw = output();
  raw.objects.push({
    id: "component-2",
    label: "Tray",
    description: "Tray",
    initiallyVisible: false,
  });
  raw.steps[0].requiredVisibleAfter = ["component-1", "component-2"];
  const result = compileGuide(raw, context);
  expect("draftVersion" in result).toBe(true);
  if (!("draftVersion" in result)) throw new Error("Expected a draft.");
  const change = result.steps[0].unresolved.find(
    (u) => u.code === "implausible_change",
  );
  expect(change?.measuredChange).toBeGreaterThan(12);
  expect(change?.frames).toBeUndefined();
});

it("accepts adjacent intervals without flagging overlap", () => {
  const raw = output();
  raw.steps[0].endFrame = 5;
  raw.steps.push({
    ...output().steps[0],
    id: "next",
    startFrame: 5,
    changeFrame: 7,
    endFrame: 10,
  });
  raw.goalFrame = 10;
  const result = compileGuide(raw, source());
  expect("draftVersion" in result).toBe(false);
  if ("draftVersion" in result) throw new Error("Expected a guide.");
  expect(result.steps.map((s) => s.supported)).toEqual([true, true]);
});

it("keeps weak-but-complete evidence as an executable guide with unsupported steps", () => {
  const context = source();
  context.tracking[0].samples[4].confidence = 0.3;
  const result = compileGuide(output(), context);
  expect("draftVersion" in result).toBe(false);
  if ("draftVersion" in result) throw new Error("Expected a guide.");
  expect(result.steps[0].supported).toBe(false);
  expect(GuideSchema.safeParse(result).success).toBe(true);
});

it("still returns an executable guide when every object and step is supported", () => {
  const result = compileGuide(output(), source());
  expect("draftVersion" in result).toBe(false);
  if ("draftVersion" in result) throw new Error("Expected a guide.");
  expect(result.steps[0].supported).toBe(true);
  expect(GuideSchema.safeParse(result).success).toBe(true);
});

it("rejects an unresolved draft at the approval boundary", async () => {
  const context = source();
  for (const sample of context.tracking[0].samples) sample.confidence = 0.5;
  const draft = compileGuide(output(), context);
  expect("draftVersion" in draft).toBe(true);
  const response = await approveGuide(
    new Request("http://localhost:3000/api/teach/guide/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        guide: draft,
        reviewer: "AUTOMATED CONTRACT TEST",
        purpose: "published",
        confirmed: true,
        reviewedStepIds: ["move"],
        goalReviewed: true,
      }),
    }),
  );
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain("unresolved");
  expect(fetch).not.toHaveBeenCalled();
});
