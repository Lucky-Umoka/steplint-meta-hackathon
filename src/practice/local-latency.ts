import { percentile } from "./detections";
export type LocalLatencyRecord = {
  frameId: string;
  frameCallbackAtMs: number;
  confirmedAtMs: number;
  paintAtMs?: number;
  observedAtMs?: number;
  workerMs: number;
  status: string;
  decision: boolean;
};
/** Software callback timings; paintAtMs is a two-animation-frame estimate,
 * not a hardware sensor timestamp or photodiode display measurement. */
export function summarizeLocalLatency(records: LocalLatencyRecord[]) {
  const complete = records.filter((r) => r.paintAtMs !== undefined);
  const distribution = (values: number[]) =>
    values.length
      ? {
          samples: values.length,
          medianMs: percentile(values, 50),
          p95Ms: percentile(values, 95),
        }
      : { samples: 0, medianMs: null, p95Ms: null };
  return {
    measurement: "frame callback → worker → verifier → two animation frames",
    hardwareSensorLatencyMeasured: false,
    allFrames: distribution(
      complete.map((r) => r.paintAtMs! - r.frameCallbackAtMs),
    ),
    confirmedDecisions: distribution(
      complete
        .filter((r) => r.decision)
        .map((r) => r.paintAtMs! - r.frameCallbackAtMs),
    ),
    sensorDwell: distribution(
      complete
        .filter((r) => r.decision && r.observedAtMs !== undefined)
        .map((r) => r.frameCallbackAtMs - r.observedAtMs!),
    ),
    onsetToFeedback: distribution(
      complete
        .filter((r) => r.decision && r.observedAtMs !== undefined)
        .map((r) => r.paintAtMs! - r.observedAtMs!),
    ),
    worker: distribution(complete.map((r) => r.workerMs)),
  };
}
