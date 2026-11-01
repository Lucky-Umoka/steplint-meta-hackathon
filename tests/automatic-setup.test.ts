import { LocalWorkerInputSchema } from "../src/practice/local-tracking-protocol";
import { expect, it } from "vitest";
import {
  alignStartingView,
  translateBox,
} from "../src/practice/automatic-alignment";
import { bootstrapLocal, trackLocal } from "../src/practice/local-tracking";
import {
  automaticSetupPlan,
  bindAutomaticSetup,
} from "../src/teach/automatic-setup";
import { localFixture } from "./fixtures/local-procedure";
import { approveDraft } from "../src/teach/schema";
import { localExecutionDraft } from "../src/teach/local-execution";
import { suggestReviews } from "../src/teach/review-suggestions";
import type { Pixels } from "../src/practice/tracker";
const box = { left: 0.15, top: 0.3, right: 0.35, bottom: 0.65 };
function scene(shift = 0, different = false): Pixels {
  const width = 160,
    height = 120,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let hash =
        Math.imul(x - shift + (different ? 111 : 0), 0x9e3779b1) ^
        Math.imul(y, 0x85ebca6b);
      hash ^= hash >>> 16;
      const value = 50 + ((hash >>> 0) % 150),
        i = (y * width + x) * 4;
      data.set([value, value, value, 255], i);
    }
  return { width, height, data };
}
it("matches the reviewed source automatically and preserves local tracking, without live boxes or confirmation", () => {
  const source = scene(),
    current = scene(3);
  const aligned = alignStartingView(source, current, [box]);
  expect(aligned.x).toBeCloseTo(3 / 160, 3);
  expect(aligned.y).toBeCloseTo(0, 3);
  const boot = bootstrapLocal(current, {
    scene: source,
    objects: [{ id: "object", box, fixed: false, image: source }],
  });
  const result = trackLocal(current, boot.state);
  expect(result.calibrationValid).toBe(true);
  expect(result.detections[0].quality).toBe("observed");
});
it("does not align unrelated or textureless scenes, or pretend another camera aspect matches", () => {
  expect(() => alignStartingView(scene(), scene(0, true), [box])).toThrow(
    "Finding",
  );
  const blank = scene();
  blank.data.fill(120);
  expect(() => alignStartingView(blank, blank, [])).toThrow("Finding");
  expect(() =>
    alignStartingView(scene(), { ...scene(), width: 159 }, []),
  ).toThrow("aspect ratio");
  expect(() => translateBox(box, 1, 0)).toThrow("outside");
});
it("derives automatic identity boxes from trusted source samples and requires exactly their source frames", () => {
  const { draft, context } = localFixture(),
    local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements[0] = {
    description: "Transfer",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Synthetic review",
  };
  const checks = suggestReviews(local, context);
  const approved = approveDraft(
    local,
    {
      reviewer: "Test",
      confirmed: true,
      goalConfirmed: true,
      steps: [
        {
          ...checks.transfer,
          stepId: "transfer",
          reviewed: true,
          conditionConfirmed: true,
        },
      ],
    },
    context,
    1000,
  );
  const plan = automaticSetupPlan(approved.procedure, approved.review, context);
  expect(plan.objects[0].box).toEqual(context.tracking[0].samples[0].box);
  expect(() =>
    bindAutomaticSetup(plan, [
      { frame: 1, image: "data:image/jpeg;base64,AAAA" },
    ]),
  ).toThrow("exactly");
  expect(
    bindAutomaticSetup(plan, [
      { frame: 0, image: "data:image/jpeg;base64,AAAA" },
    ]).sceneFrame,
  ).toBe(0);
  context.tracking[0].samples[0].confidence = 0.89;
  expect(() =>
    automaticSetupPlan(approved.procedure, approved.review, context),
  ).toThrow("reliable source");
});

it("uses two fixed object references on a different table and rejects inconsistent anchors", () => {
  const source = scene();
  const a = { left: 0.62, top: 0.1, right: 0.82, bottom: 0.3 },
    b = { left: 0.62, top: 0.6, right: 0.82, bottom: 0.8 };
  const objects = [
    { id: "moving", box, fixed: false, image: source },
    { id: "destination-a", box: a, fixed: true, image: source },
    { id: "destination-b", box: b, fixed: true, image: source },
  ];
  const onNewTable = (shiftB = 0) => {
    const image = scene(0, true);
    for (const region of [box, a, b])
      for (
        let y = Math.floor(region.top * 120);
        y < Math.ceil(region.bottom * 120);
        y++
      )
        for (
          let x = Math.floor(region.left * 160);
          x < Math.ceil(region.right * 160);
          x++
        ) {
          const dx = region === b ? shiftB : 0;
          image.data.set(
            source.data.subarray((y * 160 + x) * 4, (y * 160 + x) * 4 + 4),
            (y * 160 + x + dx) * 4,
          );
        }
    return image;
  };
  const current = onNewTable();
  const initialized = bootstrapLocal(current, { scene: source, objects });
  expect(trackLocal(current, initialized.state).calibrationValid).toBe(true);
  expect(() =>
    bootstrapLocal(onNewTable(7), { scene: source, objects }),
  ).toThrow();
});

it("validates the exact automatic browser-to-worker envelope, including zone exclusions", () => {
  const image = scene();
  const request = {
    type: "bootstrap",
    generation: 1,
    image,
    source: {
      scene: image,
      zones: [box],
      objects: [
        { id: "object", box, fixed: false, image, expectedBox: undefined },
      ],
    },
  };
  expect(LocalWorkerInputSchema.safeParse(request).success).toBe(true);
  expect(
    LocalWorkerInputSchema.safeParse({
      ...request,
      source: {
        ...request.source,
        objects: [{ ...request.source.objects[0], frame: 0 }],
      },
    }).success,
  ).toBe(false);
});

it("includes the actual reviewed goal frame while retaining earlier identity-only approvals", () => {
  const plan = {
    sceneFrame: 0,
    goalFrame: 2,
    objects: [{ id: "object", frame: 0, box, fixed: false }],
  };
  const frames = [
    { frame: 0, image: "data:image/jpeg;base64,AAAA" },
    { frame: 2, image: "data:image/jpeg;base64,BBBB" },
  ];
  expect(bindAutomaticSetup(plan, frames).frames).toEqual(frames);
  expect(bindAutomaticSetup(plan, frames.slice(0, 1)).frames).toHaveLength(1);
  expect(() =>
    bindAutomaticSetup(plan, [
      ...frames,
      { frame: 1, image: "data:image/jpeg;base64,CCCC" },
    ]),
  ).toThrow("exactly");
});
