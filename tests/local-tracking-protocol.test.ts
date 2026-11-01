import { expect, it } from "vitest";
import {
  LocalWorkerInputSchema,
  LocalWorkerReplySchema,
} from "../src/practice/local-tracking-protocol";
const frame = {
  type: "frame",
  generation: 1,
  frameId: "f",
  timestampMs: 10,
  image: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
};
it("bounds frame dimensions, byte count, generation and unexpected fields", () => {
  expect(LocalWorkerInputSchema.safeParse(frame).success).toBe(true);
  for (const invalid of [
    { ...frame, image: { ...frame.image, width: 321 } },
    { ...frame, image: { ...frame.image, data: new Uint8ClampedArray(3) } },
    { ...frame, generation: -1 },
    { ...frame, extra: true },
  ])
    expect(LocalWorkerInputSchema.safeParse(invalid).success).toBe(false);
});
it("requires diagnostic measurement provenance in calibration replies and rejects invented observed geometry", () => {
  expect(
    LocalWorkerReplySchema.safeParse({ type: "calibrated", generation: 1 })
      .success,
  ).toBe(false);
  expect(
    LocalWorkerReplySchema.safeParse({
      type: "calibrated",
      generation: 1,
      measurements: [],
    }).success,
  ).toBe(true);
  expect(
    LocalWorkerReplySchema.safeParse({
      type: "tracked",
      generation: 1,
      timestampMs: 10,
      frameId: "f",
      processingMs: 1,
      calibrationValid: true,
      reason: null,
      measurements: [],
      detections: [
        { objectId: "a", quality: "observed", box: null, score: 0.99 },
      ],
    }).success,
  ).toBe(false);
});
