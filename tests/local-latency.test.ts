import { expect, it } from "vitest";
import { summarizeLocalLatency } from "../src/practice/local-latency";
it("separates dwell, software feedback and total onset timing", () => {
  const report = summarizeLocalLatency([
    {
      frameId: "f",
      observedAtMs: 100,
      frameCallbackAtMs: 500,
      confirmedAtMs: 510,
      paintAtMs: 530,
      workerMs: 8,
      status: "passed",
      decision: true,
    },
  ]);
  expect(report.confirmedDecisions.medianMs).toBe(30);
  expect(report.sensorDwell.medianMs).toBe(400);
  expect(report.onsetToFeedback.medianMs).toBe(430);
  expect(report.hardwareSensorLatencyMeasured).toBe(false);
});
it("does not report missing measurements as zero latency", () => {
  expect(summarizeLocalLatency([]).confirmedDecisions.medianMs).toBeNull();
});
