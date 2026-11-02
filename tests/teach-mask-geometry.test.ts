import { expect, it, vi } from "vitest";
import type {
  SegmentationMask,
  SegmentationRecord,
  VideoSegmentationResult,
} from "@meta-sam/parser";
import { localFixture } from "./fixtures/local-procedure";
import { summarizeTracking, sparkRequest } from "../src/server/teach/pipeline";
vi.mock("server-only", () => ({}));
// Mock only codec bytes; exercise real source-coordinate mapping, summary and
// final drafting input. This is synthetic geometry, not provider success.
vi.mock("@meta-sam/parser", async (original) => ({
  ...(await original<typeof import("@meta-sam/parser")>()),
  decodeMaskToRaster: (mask: SegmentationMask) =>
    Uint8Array.from(mask.payload.split(",").map(Number)),
}));
function result(xs: number[], fill = false): VideoSegmentationResult {
  const records: SegmentationRecord[] = [];
  xs.forEach((x, frame) => {
    const pixels = new Uint8Array(100);
    if (fill) pixels.fill(1);
    else
      for (let y = 3; y < 6; y++)
        for (let xx = x; xx < x + 2; xx++) pixels[y * 10 + xx] = 1;
    records.push({
      kind: "box",
      order: frame * 2,
      objectId: "1",
      frame: { frameIndex: frame },
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      confidence: 0.99,
    });
    records.push({
      kind: "mask",
      order: frame * 2 + 1,
      objectId: "1",
      frame: { frameIndex: frame },
      identity: `m${frame}`,
      revision: 1,
      bounds: { left: 0, top: 0, right: 320, bottom: 240 },
      mask: {
        encoding: "one_bit",
        payload: [...pixels].join(","),
        width: 10,
        height: 10,
      },
    });
  });
  return {
    media: "video",
    revision: 1,
    records,
    diagnostics: [],
    rawOutput: "",
    outcome: { status: "completed" },
  };
}
it("sends measured moving foreground rather than a constant full-frame canvas to Spark", () => {
  const { context } = localFixture();
  const tracking = summarizeTracking(
    result([1, 4, 7]),
    context.selections,
    context.lesson.media,
  );
  expect(tracking[0].samples.map((s) => s.box.left)).toEqual([0.1, 0.4, 0.7]);
  expect(tracking[0].samples[2].box.right).toBe(0.9);
  expect(tracking[0].samples[0].confidence).toBe(0.99);
  const evidence = JSON.parse(sparkRequest({ ...context, tracking }).input);
  expect(evidence.tracking[0].samples[2].box.left).toBe(0.7);
});
it("retains stationary localized reference objects without inventing movement", () => {
  const { context } = localFixture();
  const t = summarizeTracking(
    result([2, 2, 2]),
    context.selections,
    context.lesson.media,
  );
  expect(t[0].samples).toHaveLength(3);
  expect(new Set(t[0].samples.map((s) => s.box.left)).size).toBe(1);
});
it("does not treat a true whole-scene mask as usable object tracking", () => {
  const { context } = localFixture();
  const t = summarizeTracking(
    result([0, 0, 0], true),
    context.selections,
    context.lesson.media,
  );
  expect(t[0].samples).toHaveLength(0);
  expect(t[0].missingFrames).toBe(3);
});

it("rejects an automatic whole-scene seed before any SAM request", async () => {
  const { parseDiscovery } = await import("../src/server/teach/discovery");
  const { context } = localFixture();
  expect(() =>
    parseDiscovery(
      {
        status: "completed",
        output_text: JSON.stringify({
          components: [
            {
              description: "Object",
              timestampMs: 0,
              box: { left: 0, top: 0, right: 1000, bottom: 1000 },
            },
          ],
        }),
      },
      context.lesson,
    ),
  ).toThrow("whole scene");
});

it("projects foreground pixels through the mask's own source bounds", () => {
  const { context } = localFixture();
  const original = result([1]);
  const projected = {
    ...original,
    records: original.records.map((record) =>
      record.kind === "mask"
        ? { ...record, bounds: { left: 64, top: 48, right: 256, bottom: 192 } }
        : record,
    ),
  };
  const sample = summarizeTracking(
    projected,
    context.selections,
    context.lesson.media,
  )[0].samples[0];
  expect(sample.box.left).toBeCloseTo(0.26);
  expect(sample.box.top).toBeCloseTo(0.38);
});
