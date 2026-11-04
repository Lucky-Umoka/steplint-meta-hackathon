/**
 * Learner progress and time-to-goal estimate for Practice. Display only:
 * derived from verifier step states and timestamps, never fed back into it.
 */
export type ProgressInput = {
  /** Approved steps in order with their demonstrated duration (ms). */
  steps: { id: string; demoMs: number }[];
  /** Verifier status per step id. */
  status: Record<string, string | undefined>;
  /** When Practice started running (same clock as nowMs). */
  startedAtMs: number | null;
  nowMs: number;
  goalComplete: boolean;
};
export type ProgressEstimate = {
  done: number;
  total: number;
  /** 0..1; the final goal check counts as the last share. */
  fraction: number;
  elapsedMs: number;
  /** Predicted time left, or null before Practice starts / once complete. */
  remainingMs: number | null;
  /** Learner time ÷ demonstrated time so far (1 = same speed); null if unknown. */
  pace: number | null;
};

const MIN_DEMO_MS = 1500;

export function estimateProgress(input: ProgressInput): ProgressEstimate {
  const total = input.steps.length;
  const done = input.steps.filter((s) => input.status[s.id] === "passed").length;
  const elapsedMs =
    input.startedAtMs === null ? 0 : Math.max(0, input.nowMs - input.startedAtMs);
  const shares = total + 1; // each step, plus the final goal hold
  const fraction = input.goalComplete
    ? 1
    : Math.min(1, done / shares + (done === total && total > 0 ? 0.5 / shares : 0));
  const demo = (s: { demoMs: number }) => Math.max(MIN_DEMO_MS, s.demoMs);
  const demoDone = input.steps
    .filter((s) => input.status[s.id] === "passed")
    .reduce((sum, s) => sum + demo(s), 0);
  const demoLeft = input.steps
    .filter((s) => input.status[s.id] !== "passed")
    .reduce((sum, s) => sum + demo(s), 0);
  const pace =
    done > 0 && demoDone > 0 ? Math.min(10, Math.max(0.2, elapsedMs / demoDone)) : null;
  const remainingMs =
    input.startedAtMs === null || input.goalComplete
      ? null
      : Math.round(demoLeft * (pace ?? 1.5));
  return { done, total, fraction, elapsedMs, remainingMs, pace };
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/** Personal best per lesson (browser-local convenience; never shared). */
export function bestTimeKey(lessonId: string) {
  return `steplint-best-time:${lessonId}`;
}
