import type { Tracking } from "../teach/schema";
/** Measured source coverage, not a calibrated probability that a procedure is correct. */
export function sourceEvidence(tracking: Tracking) {
  return tracking.map((track) => {
    const samples = [...track.samples].sort((a, b) => a.frame - b.frame);
    const runs: (typeof samples)[] = [];
    for (const sample of samples) {
      if (sample.confidence === null || sample.confidence < 0.9) continue;
      const last = runs.at(-1);
      if (!last || last.at(-1)!.frame + 1 !== sample.frame) runs.push([sample]);
      else last.push(sample);
    }
    const windows = runs
      .filter((run) => run.length >= 4)
      .flatMap((run) => {
        const first = run[0],
          last = run.at(-1)!;
        const center = (box: typeof first.box) => [
          (box.left + box.right) / 2,
          (box.top + box.bottom) / 2,
        ];
        const a = center(first.box),
          b = center(last.box);
        return [
          {
            startFrame: first.frame,
            endFrame: last.frame,
            startMs: first.timestampMs,
            endMs: last.timestampMs,
            displacement:
              Math.hypot(a[0] - b[0], a[1] - b[1]) /
              Math.max(
                0.02,
                Math.hypot(
                  first.box.right - first.box.left,
                  first.box.bottom - first.box.top,
                ),
              ),
          },
        ];
      });
    const trustedFrames = runs.reduce((sum, run) => sum + run.length, 0);
    return {
      objectId: track.componentId,
      observedFrames: samples.length,
      trustedFrames,
      trustedFractionOfObserved: samples.length
        ? trustedFrames / samples.length
        : 0,
      longestTrustedRun: Math.max(0, ...runs.map((run) => run.length)),
      windows: windows.slice(0, 12),
    };
  });
}
