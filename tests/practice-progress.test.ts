import { expect, it } from "vitest";
import { estimateProgress, formatDuration } from "../src/practice/progress";

const steps = [
  { id: "a", demoMs: 4000 },
  { id: "b", demoMs: 6000 },
];
it("before starting there is no estimate; at start it uses the demonstrated time", () => {
  expect(estimateProgress({ steps, status: {}, startedAtMs: null, nowMs: 0, goalComplete: false })).toMatchObject({
    done: 0, total: 2, fraction: 0, remainingMs: null, pace: null,
  });
  const atStart = estimateProgress({ steps, status: {}, startedAtMs: 1000, nowMs: 1000, goalComplete: false });
  expect(atStart.remainingMs).toBe(15000); // (4 s + 6 s) × 1.5 before any pace is known
});
it("rescales the time left by the learner's own pace", () => {
  // First step took 8 s against a 4 s demonstration: pace 2 → 6 s × 2 = 12 s left.
  const e = estimateProgress({ steps, status: { a: "passed" }, startedAtMs: 0, nowMs: 8000, goalComplete: false });
  expect(e.pace).toBe(2);
  expect(e.remainingMs).toBe(12000);
  expect(e.fraction).toBeCloseTo(1 / 3);
});
it("all steps passed is not yet 100%; the verified goal is", () => {
  expect(estimateProgress({ steps, status: { a: "passed", b: "passed" }, startedAtMs: 0, nowMs: 9000, goalComplete: false }).fraction).toBeCloseTo(2.5 / 3);
  const done = estimateProgress({ steps, status: { a: "passed", b: "passed" }, startedAtMs: 0, nowMs: 9000, goalComplete: true });
  expect(done).toMatchObject({ fraction: 1, remainingMs: null, elapsedMs: 9000 });
});
it("a failed (reversed) step does not count as done", () => {
  expect(estimateProgress({ steps, status: { a: "failed" }, startedAtMs: 0, nowMs: 5000, goalComplete: false }).done).toBe(0);
});
it("formats durations for learners", () => {
  expect(formatDuration(23400)).toBe("23 s");
  expect(formatDuration(75000)).toBe("1 min 15 s");
});
