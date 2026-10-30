import { expect, it } from "vitest";
import { fitSimilarity, transformPoint } from "../src/practice/similarity";
it("follows coherent translation, rotation and size changes while rejecting a distractor", () => {
  const angle = 0.12,
    scale = 1.08,
    t = {
      a: scale * Math.cos(angle),
      b: scale * Math.sin(angle),
      tx: 4,
      ty: -3,
    };
  const pairs = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 50, y: 10 },
    { x: 10, y: 30 },
    { x: 30, y: 30 },
    { x: 50, y: 30 },
    { x: 20, y: 50 },
    { x: 40, y: 50 },
  ].map((from) => ({ from, to: transformPoint(t, from) }));
  pairs.push({ from: { x: 70, y: 70 }, to: { x: 5, y: 90 } });
  const result = fitSimilarity(pairs);
  expect(result).not.toBeNull();
  expect(result!.scale).toBeCloseTo(scale);
  expect(result!.rotation).toBeCloseTo(angle);
  expect(result!.inliers).toHaveLength(8);
});
it("abstains on too little evidence, large deformation and collapsed features", () => {
  expect(fitSimilarity([])).toBeNull();
  expect(
    fitSimilarity(
      Array.from({ length: 6 }, () => ({
        from: { x: 1, y: 1 },
        to: { x: 3, y: 3 },
      })),
    ),
  ).toBeNull();
  expect(
    fitSimilarity(
      Array.from({ length: 8 }, (_, i) => ({
        from: { x: i * 10, y: (i % 2) * 10 },
        to: { x: i * 30, y: (i % 2) * 30 },
      })),
    ),
  ).toBeNull();
});
