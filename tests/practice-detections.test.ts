import { describe, expect, it } from "vitest";
import type { ObjectDetection } from "../src/guide/schema";
import { sameDetections, percentile } from "../src/practice/detections";

const at = (x: number): ObjectDetection => ({
  objectId: "cover",
  quality: "observed",
  box: { left: x, top: 0.2, right: x + 0.2, bottom: 0.4 },
  score: 0.95,
});
describe("overlay render gating", () => {
  it("skips identical frames but updates on visible change", () => {
    expect(sameDetections([at(0.1)], [at(0.1)])).toBe(true);
    expect(sameDetections([at(0.1)], [at(0.101)])).toBe(true);
    expect(sameDetections([at(0.1)], [at(0.11)])).toBe(false);
    expect(
      sameDetections([at(0.1)], [{ ...at(0.1), quality: "missing" }]),
    ).toBe(false);
    expect(sameDetections([at(0.1)], [])).toBe(false);
  });
});
describe("timing percentiles", () => {
  it("handles empty input and reports median and p95", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([4, 1, 3, 2], 50)).toBe(3);
    expect(percentile([4, 1, 3, 2], 95)).toBe(4);
  });
});
