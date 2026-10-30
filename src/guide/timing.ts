import type { Guide } from "./schema";
export type ClockPhase =
  | "setup"
  | "active"
  | "paused"
  | "verifying"
  | "complete";
export type SessionClock = {
  phase: ClockPhase;
  lastAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  stepId: string | null;
  activeMs: number;
  pausedMs: number;
  verificationMs: number;
  stepMs: Record<string, number>;
};
export function createSessionClock(at = 0): SessionClock {
  return {
    phase: "setup",
    lastAt: at,
    startedAt: null,
    finishedAt: null,
    stepId: null,
    activeMs: 0,
    pausedMs: 0,
    verificationMs: 0,
    stepMs: {},
  };
}
export function clockPhase(
  clock: SessionClock,
  at: number,
  phase: ClockPhase,
  stepId: string | null = null,
) {
  if (!Number.isFinite(at) || at < clock.lastAt)
    throw Error("The session clock must move forward.");
  if (clock.finishedAt !== null) return;
  const delta = at - clock.lastAt;
  if (clock.startedAt !== null) {
    if (clock.phase === "active") {
      clock.activeMs += delta;
      if (clock.stepId)
        clock.stepMs[clock.stepId] = (clock.stepMs[clock.stepId] ?? 0) + delta;
    } else if (clock.phase === "paused") clock.pausedMs += delta;
    else if (clock.phase === "verifying") clock.verificationMs += delta;
  }
  if (clock.startedAt === null && phase === "active") clock.startedAt = at;
  clock.lastAt = at;
  clock.phase = phase;
  clock.stepId = stepId;
  if (phase === "complete" && clock.startedAt !== null) clock.finishedAt = at;
}
export function timingSummary(
  clock: SessionClock,
  guide: Guide,
  states: Record<string, string>,
  at: number,
) {
  const c = { ...clock, stepMs: { ...clock.stepMs } };
  clockPhase(c, Math.max(at, c.lastAt), c.phase, c.stepId);
  const reference = (id: string) => {
    const step = guide.steps.find((s) => s.id === id)!;
    return step.evidence.endMs - step.evidence.startMs;
  };
  const ratios = guide.steps
    .filter((s) => states[s.id] === "verified" && (c.stepMs[s.id] ?? 0) > 0)
    .map((s) => c.stepMs[s.id] / reference(s.id))
    .sort((a, b) => a - b);
  const pace = ratios.length
    ? Math.max(0.25, Math.min(8, ratios[Math.floor(ratios.length / 2)]))
    : 1;
  const pending = guide.steps.filter((s) => states[s.id] !== "verified");
  const current = pending[0];
  const overdue =
    !!current && (c.stepMs[current.id] ?? 0) >= reference(current.id) * pace;
  const remainingMs =
    c.finishedAt !== null
      ? 0
      : overdue || pending.length === 0
        ? null
        : pending.reduce(
            (sum, s) =>
              sum +
              Math.max(
                0,
                reference(s.id) * pace -
                  (s.id === current?.id ? (c.stepMs[s.id] ?? 0) : 0),
              ),
            0,
          );
  return {
    elapsedMs: c.startedAt === null ? 0 : (c.finishedAt ?? at) - c.startedAt,
    activeMs: c.activeMs,
    pausedMs: c.pausedMs,
    verificationMs: c.verificationMs,
    stepMs: c.stepMs,
    demonstratedMs: guide.steps.reduce((sum, s) => sum + reference(s.id), 0),
    remainingMs,
    estimateBasis: ratios.length
      ? ("your_completed_steps" as const)
      : ("demonstration" as const),
    completed: guide.steps.filter((s) => states[s.id] === "verified").length,
    totalSteps: guide.steps.length,
  };
}
export const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Anonymous device-local outcomes; never a cross-learner population rating. */
export type TimingRecord = {
  at: number;
  completed: boolean;
  activeMs: number;
  pausedMs: number;
  verificationMs: number;
  elapsedMs: number;
  corrections: number;
  stepMs: Record<string, number>;
};
export function localAverage(records: TimingRecord[]) {
  const completed = records.filter((r) => r.completed);
  return completed.length >= 3
    ? {
        samples: completed.length,
        activeMs:
          completed.reduce((sum, r) => sum + r.activeMs, 0) / completed.length,
      }
    : null;
}
