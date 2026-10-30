import { expect, it } from "vitest";
import { needsStartingView } from "../src/guide/perception-gates";
it("cannot turn a pre-existing goal or mid-action reacquisition into an observed before-state", () => {
  for (const phase of [
    "in_progress",
    "goal",
    "no_work_area",
    "uncertain",
  ] as const)
    expect(needsStartingView(phase, false)).toBe(true);
  expect(needsStartingView("starting", false)).toBe(false);
  expect(needsStartingView("goal", true)).toBe(false); // existing fresh observed history is evaluated separately, never by this model label
});
