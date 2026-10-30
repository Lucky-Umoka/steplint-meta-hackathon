import { it, expect } from "vitest";
import { compileGuide, type CompilerOutputSchema } from "../src/guide/compile";
import type { z } from "zod";
import type { TeachContext } from "../src/teach/schema";
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
it("compiles actual frame evidence and derives a measurable condition without approval", () => {
  const g = compileGuide(output(), source());
  expect(g.approval).toBeNull();
  expect(g.steps[0].supported).toBe(true);
  expect(g.steps[0].condition.minimumChange).toBeGreaterThan(0.15);
  expect(g.steps[0].evidence.endMs).toBe(1000);
});
it.each(["missing", "uncertain", "no change"])(
  "does not approve %s tracking as a supported step",
  (mode) => {
    const context = source();
    if (mode === "missing") context.tracking[0].samples.splice(4, 1);
    else if (mode === "uncertain")
      context.tracking[0].samples[4].confidence = 0.3;
    else
      for (const s of context.tracking[0].samples)
        s.box = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 };
    expect(compileGuide(output(), context).steps[0].supported).toBe(false);
  },
);
it("rejects invented object identities, nonexistent frames and made-up turn references", () => {
  const raw = output();
  raw.objects[0].id = "invented";
  expect(() => compileGuide(raw, source())).toThrow("untracked");
  const time = output();
  time.steps[0].endFrame = 1000;
  expect(() => compileGuide(time, source())).toThrow("source times");
  const speech = output();
  speech.steps[0].turnIds = [10];
  expect(() => compileGuide(speech, source())).toThrow();
});
it("preserves unresolved and outside-goal narration instead of silently calling a partial guide complete", () => {
  const raw = output();
  raw.coverage.push(
    {
      instruction: "Repair the phone",
      status: "outside_goal",
      reason: "Only unboxing is demonstrated",
    },
    {
      instruction: "An unclear next action",
      status: "unresolved",
      reason: "No usable visual evidence",
    },
  );
  const g = compileGuide(raw, source());
  expect(g.coverage.filter((c) => c.status !== "included")).toHaveLength(2);
});
