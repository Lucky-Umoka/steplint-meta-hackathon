import { expect, it } from "vitest";
import { outsidePlacementTarget } from "../src/practice/target-feedback";
import type { RelationPlan } from "../src/guide/relations";
import type { ObjectDetection } from "../src/guide/schema";
const step: RelationPlan["steps"][number] = {
  id: "place",
  instruction: "Place",
  explanation: "Base rests on support",
  correction: "Return",
  objectId: "part",
  anchorId: "target",
  before: "separate",
  after: "supported_by",
  startMs: 0,
  changeMs: 500,
  endMs: 1000,
};
const scene = (left: number): ObjectDetection[] => [
  {
    objectId: "part",
    quality: "observed",
    score: 0.99,
    box: { left, top: 0.2, right: left + 0.1, bottom: 0.5 },
  },
  {
    objectId: "target",
    quality: "observed",
    score: 0.99,
    box: { left: 0.4, top: 0.4, right: 0.7, bottom: 0.6 },
  },
];
it("warns about a clearly moved part outside its target, not an unchanged start", () => {
  expect(outsidePlacementTarget(step, scene(0.1), scene(0.1))).toBe(false);
  expect(outsidePlacementTarget(step, scene(0.1), scene(0.8))).toBe(true);
  expect(outsidePlacementTarget(step, scene(0.1), scene(0.5))).toBe(false);
});
it("does not infer wrong placement from missing identity or a different kind of rule", () => {
  const missing = scene(0.8);
  missing[0].quality = "ambiguous";
  expect(outsidePlacementTarget(step, scene(0.1), missing)).toBe(false);
  expect(
    outsidePlacementTarget({ ...step, after: "open" }, scene(0.1), scene(0.8)),
  ).toBe(false);
});
it("uses target-relative motion, so camera translation alone is not a wrong-placement warning", () => {
  const moved = scene(0.1).map((d) => ({
    ...d,
    box: { ...d.box!, left: d.box!.left + 0.1, right: d.box!.right + 0.1 },
  }));
  expect(outsidePlacementTarget(step, scene(0.1), moved)).toBe(false);
});

it("ignores camera zoom when both object and target scale together", () => {
  const zoom = scene(0.1).map((d) => ({
    ...d,
    box: {
      left: d.box!.left * 1.2,
      top: d.box!.top * 1.2,
      right: d.box!.right * 1.2,
      bottom: d.box!.bottom * 1.2,
    },
  }));
  expect(outsidePlacementTarget(step, scene(0.1), zoom)).toBe(false);
});
it("abstains from a provisional warning when the target shape changes", () => {
  const turned = scene(0.8);
  turned[1].box!.bottom = 0.8;
  expect(outsidePlacementTarget(step, scene(0.1), turned)).toBe(false);
});
