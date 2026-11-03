import { expect, it } from "vitest";
import { bootstrapLocal } from "../src/practice/local-tracking";
import { smoothTable, at } from "./fixtures/practice-scene";
import type { Pixels } from "../src/practice/tracker";

const M = { left: 0.1, top: 0.35, right: 0.3, bottom: 0.65 },
  P = { left: 0.6, top: 0.6, right: 0.85, bottom: 0.9 },
  L = { left: 0.6, top: 0.1, right: 0.8, bottom: 0.3 };
const exposure = (image: Pixels, gain: number, offset: number): Pixels => {
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < data.length; i += 4)
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * gain + offset);
  return { ...image, data };
};
const source = smoothTable([{ box: M, seed: 1 }, { box: P, seed: 2 }, { box: L, seed: 4 }]);
const objects = [
  { id: "mover", box: M, fixed: false, image: source },
  { id: "plate", box: P, fixed: true, image: source },
  { id: "lid", box: L, fixed: true, image: source },
];
it("finds approved objects under a different camera exposure (live run 1 root cause), but not a different object", () => {
  const darker = exposure(source, 0.75, -10);
  expect(() => bootstrapLocal(darker, { scene: source, objects })).not.toThrow();
  const other = exposure(smoothTable([{ box: M, seed: 9 }, { box: P, seed: 2 }, { box: L, seed: 4 }]), 0.75, -10);
  expect(() => bootstrapLocal(other, { scene: source, objects })).toThrow(/Finding mover/);
});
it("each zone follows its own stationary reference when objects are placed by hand", () => {
  // The plate is placed 0.05 to the right; the lid stays put.
  const live = smoothTable([{ box: M, seed: 1 }, { box: at(P, 0.05), seed: 2 }, { box: L, seed: 4 }]);
  const plateZone = { left: 0.62, top: 0.62, right: 0.83, bottom: 0.88 },
    lidZone = { left: 0.62, top: 0.12, right: 0.78, bottom: 0.28 };
  const { zoneTranslations } = bootstrapLocal(live, { scene: source, objects, zones: [plateZone, lidZone] });
  expect(zoneTranslations[0].x).toBeCloseTo(0.05, 2);
  expect(zoneTranslations[1].x).toBeCloseTo(0, 2);
});
it("a reference far from its demonstrated position blocks with an instruction", () => {
  const live = smoothTable([{ box: M, seed: 1 }, { box: at(P, -0.25), seed: 2 }, { box: L, seed: 4 }]);
  // The far plate is not matched near its approved place at all, or is rejected as misplaced.
  let error = "";
  try {
    bootstrapLocal(live, { scene: source, objects: objects.map((o) => (o.id === "plate" ? { ...o, required: true } : o)) });
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toMatch(/far from its demonstrated position|Finding plate|Show at least|Finding the work area/);
});
import { teachV3Fixture } from "./fixtures/teach-v3";
import { localExecutionDraft } from "../src/teach/local-execution";
import { approveDraft } from "../src/teach/schema";
import { reviewStepInput, suggestReviews } from "../src/teach/review-suggestions";
import { automaticSetupPlan } from "../src/teach/automatic-setup";
it("takes the mover's identity view from an earlier approved reference frame at the same start position (no hand on it)", () => {
  const { draft, context } = teachV3Fixture();
  const local = localExecutionDraft(draft, "Transfer", context);
  const checks = suggestReviews(local, context);
  const reviewed = approveDraft(local, { reviewer: "T", confirmed: true, goalConfirmed: true, steps: local.procedure.steps.map((s) => reviewStepInput(s.id, { ...checks[s.id], reviewed: true, conditionConfirmed: true })) }, context, 1);
  // Fixture: action starts at frame 4; reference frames are [0, 10]; frame 0 is the same resting position.
  expect(automaticSetupPlan(reviewed.procedure, reviewed.review, context).objects[0].frame).toBe(0);
});
