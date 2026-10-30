import {
  GuideSchema,
  ObservationSchema,
  type Guide,
  type GuideObservation,
  type GuideStep,
  type ObjectDetection,
  type Box,
} from "./schema";
export const center = (b: Box) => ({
  x: (b.left + b.right) / 2,
  y: (b.top + b.bottom) / 2,
});
export const diagonal = (b: Box) =>
  Math.hypot(b.right - b.left, b.bottom - b.top);
export type StepState =
  | "waiting"
  | "observing"
  | "verified"
  | "uncertain"
  | "violation";
export type PracticeEvent = {
  id: string;
  at: number;
  kind:
    | "started"
    | "verified"
    | "uncertain"
    | "violation"
    | "retry"
    | "reset"
    | "complete";
  stepId: string | null;
  message: string;
  sourceFrame: number | null;
};
export type GuideSession = {
  guide: Guide;
  epoch: string;
  running: boolean;
  finished: boolean;
  lastTime: number;
  seen: Set<string>;
  baseline: Record<string, GuideObservation>;
  candidates: Record<string, { since: number; count: number }>;
  steps: Record<string, StepState>;
  events: PracticeEvent[];
  sequence: number;
  lastObservation: GuideObservation | null;
  goalSince: number | null;
};
export function createGuideSession(
  input: unknown,
  epoch: string,
): GuideSession {
  const guide = GuideSchema.parse(input);
  if (!guide.approval) throw Error("Review this guide before practicing.");
  return {
    guide,
    epoch,
    running: false,
    finished: false,
    lastTime: -1,
    seen: new Set(),
    baseline: {},
    candidates: {},
    steps: Object.fromEntries(guide.steps.map((s) => [s.id, "waiting"])),
    events: [],
    sequence: 0,
    lastObservation: null,
    goalSince: null,
  };
}
const clear = (
  d: ObjectDetection | undefined,
): d is ObjectDetection & { box: Box } =>
  !!d &&
  d.quality === "observed" &&
  !!d.box &&
  d.score !== null &&
  d.score >= 0.9;
function get(o: GuideObservation, id: string) {
  return o.objects.find((d) => d.objectId === id);
}
export function changeMetric(
  step: GuideStep,
  before: GuideObservation,
  after: GuideObservation,
): number | null {
  const a = get(before, step.condition.objectId),
    b = get(after, step.condition.objectId);
  if (!clear(a) || !clear(b)) return null;
  const p = center(a.box),
    q = center(b.box);
  if (step.condition.kind === "movement")
    return Math.hypot(p.x - q.x, p.y - q.y) / Math.max(0.02, diagonal(a.box));
  const anchor = step.condition.anchorId;
  if (!anchor) return null;
  const c = get(before, anchor),
    d = get(after, anchor);
  if (!clear(c) || !clear(d)) return null;
  const x = center(c.box),
    y = center(d.box);
  return (
    Math.hypot(q.x - y.x, q.y - y.y) / Math.max(0.02, diagonal(d.box)) -
    Math.hypot(p.x - x.x, p.y - x.y) / Math.max(0.02, diagonal(c.box))
  );
}
function emit(
  s: GuideSession,
  kind: PracticeEvent["kind"],
  at: number,
  step: GuideStep | null,
  message: string,
) {
  const e = {
    id: `${s.epoch}-${++s.sequence}`,
    at,
    kind,
    stepId: step?.id ?? null,
    message,
    sourceFrame: step?.evidence.changeFrame ?? null,
  };
  s.events.push(e);
  if (s.events.length > 1500) s.events.shift();
  return e;
}
export function beginGuide(
  s: GuideSession,
  baseline: GuideObservation,
  automatic = false,
) {
  if (s.running || s.finished) return false;
  const o = ObservationSchema.parse(baseline);
  if (o.cameraEpoch !== s.epoch)
    throw Error("Camera setup changed. Let setup finish again.");
  const index = s.guide.steps.findIndex(
    (step) => s.steps[step.id] !== "verified",
  );
  const active = s.guide.steps[Math.max(0, index)];
  const needed =
    index > 0
      ? new Set([
          active.condition.objectId,
          ...(active.condition.anchorId ? [active.condition.anchorId] : []),
        ])
      : new Set(
          s.guide.objects
            .filter(
              (o) =>
                o.initiallyVisible &&
                s.guide.steps.some(
                  (st) =>
                    st.condition.objectId === o.id ||
                    st.condition.anchorId === o.id ||
                    st.condition.requiredVisibleAfter.includes(o.id),
                ),
            )
            .map((o) => o.id),
        );
  const required = s.guide.objects.filter((o) => needed.has(o.id));
  if (!required.length || required.some((obj) => !clear(get(o, obj.id))))
    throw Error("Keep the starting objects visible before beginning.");
  s.running = true;
  for (const step of s.guide.steps)
    if (s.steps[step.id] !== "verified" && changeMetric(step, o, o) !== null)
      s.baseline[step.id] = o;
  emit(
    s,
    "started",
    o.timestampMs,
    null,
    automatic ? "Practice started as you began the task." : "Practice started.",
  );
  return true;
}
/** One observed baseline + task-relevant change. Presence or arbitrary camera motion is insufficient. */
export function shouldAutoStart(
  guide: Guide,
  before: GuideObservation,
  after: GuideObservation,
) {
  if (
    before.cameraEpoch !== after.cameraEpoch ||
    after.timestampMs <= before.timestampMs ||
    after.timestampMs - before.timestampMs > 3000
  )
    return false;
  return guide.steps.some((s) => {
    const change = changeMetric(s, before, after);
    return (
      change !== null &&
      change >= s.condition.minimumChange &&
      s.condition.requiredVisibleAfter.every((id) => clear(get(after, id)))
    );
  });
}
export function feedGuideObservation(s: GuideSession, input: unknown) {
  const o = ObservationSchema.parse(input);
  if (
    !s.running ||
    s.finished ||
    o.cameraEpoch !== s.epoch ||
    s.seen.has(o.id) ||
    o.timestampMs <= s.lastTime
  )
    return [];
  const offset = s.events.length;
  s.seen.add(o.id);
  if (s.seen.size > 20000)
    throw Error("This session is full. Save the log and start a new session.");
  const gap = s.lastTime >= 0 && o.timestampMs - s.lastTime > 700;
  s.lastTime = o.timestampMs;
  s.lastObservation = o;
  for (const step of s.guide.steps) {
    if (s.steps[step.id] === "verified" || s.steps[step.id] === "violation")
      continue;
    const baseline = s.baseline[step.id];
    const metric = baseline && !gap ? changeMetric(step, baseline, o) : null;
    if (metric === null) {
      delete s.candidates[step.id];
      delete s.baseline[step.id];
      s.steps[step.id] = "uncertain";
      const active = s.guide.steps.find((s1) => s.steps[s1.id] !== "verified");
      if (
        active?.id === step.id &&
        (s.events.at(-1)?.kind !== "uncertain" ||
          s.events.at(-1)?.stepId !== step.id)
      )
        emit(
          s,
          "uncertain",
          o.timestampMs,
          step,
          "Keep the relevant objects visible. A new clear starting view is needed.",
        );
      else if (active?.id !== step.id) s.steps[step.id] = "waiting";
      if (changeMetric(step, o, o) !== null) s.baseline[step.id] = o;
      continue;
    }
    if (metric < step.condition.minimumChange) {
      delete s.candidates[step.id];
      s.steps[step.id] = "observing";
      continue;
    }
    if (!step.condition.requiredVisibleAfter.every((id) => clear(get(o, id)))) {
      delete s.candidates[step.id];
      s.steps[step.id] = "uncertain";
      continue;
    }
    const candidate = s.candidates[step.id] ?? {
      since: o.timestampMs,
      count: 0,
    };
    candidate.count++;
    s.candidates[step.id] = candidate;
    if (candidate.count < 3 || o.timestampMs - candidate.since < 400) continue;
    const earlier = s.guide.steps.slice(0, s.guide.steps.indexOf(step));
    if (
      earlier.some((s1) => s.steps[s1.id] !== "verified") ||
      step.prerequisites.some((id) => s.steps[id] !== "verified")
    ) {
      s.steps[step.id] = "violation";
      emit(s, "violation", candidate.since, step, step.correction);
      continue;
    }
    s.steps[step.id] = "verified";
    emit(s, "verified", o.timestampMs, step, step.instruction);
    delete s.candidates[step.id];
    // A later action needs a fresh before view after its prerequisites, including reused objects.
    for (const next of s.guide.steps.slice(s.guide.steps.indexOf(step) + 1)) {
      if (s.steps[next.id] !== "violation") {
        delete s.candidates[next.id];
        if (changeMetric(next, o, o) !== null) s.baseline[next.id] = o;
        else delete s.baseline[next.id];
      }
    }
  }
  const goalReady =
    s.guide.steps.every((step) => s.steps[step.id] === "verified") &&
    s.guide.goalStepIds.every((id) => {
      const step = s.guide.steps.find((step) => step.id === id)!;
      const baseline = s.baseline[id];
      const change = baseline ? changeMetric(step, baseline, o) : null;
      return (
        change !== null &&
        change >= step.condition.minimumChange &&
        step.condition.requiredVisibleAfter.every((id) => clear(get(o, id)))
      );
    });
  if (goalReady) {
    s.goalSince ??= o.timestampMs;
    if (o.timestampMs - s.goalSince >= 400) {
      s.finished = true;
      emit(
        s,
        "complete",
        o.timestampMs,
        null,
        "All reviewed steps and the visible final goal were verified.",
      );
    }
  } else s.goalSince = null;

  return s.events.slice(offset);
}
export function retryGuide(s: GuideSession, at: number) {
  const failed = s.guide.steps.findIndex(
    (step) =>
      s.steps[step.id] === "violation" || s.steps[step.id] === "uncertain",
  );
  if (failed < 0) return;
  s.guide.steps.slice(failed).forEach((step) => {
    s.steps[step.id] = "waiting";
    delete s.baseline[step.id];
    delete s.candidates[step.id];
  });
  s.running = false;
  s.finished = false;
  emit(
    s,
    "retry",
    at,
    s.guide.steps[failed],
    "Return to the starting view, then continue when setup is ready.",
  );
}

export function recoverReturnedObjects(s: GuideSession, o: GuideObservation) {
  const recovered: PracticeEvent[] = [];
  for (const step of s.guide.steps) {
    if (s.steps[step.id] !== "violation") continue;
    const before = s.baseline[step.id];
    const change = before ? changeMetric(step, before, o) : null;
    if (change !== null && change < step.condition.minimumChange * 0.25) {
      s.steps[step.id] = "waiting";
      s.baseline[step.id] = o;
      delete s.candidates[step.id];
      recovered.push(
        emit(
          s,
          "retry",
          o.timestampMs,
          step,
          "Starting position restored. Follow the current instruction.",
        ),
      );
    }
  }
  return recovered;
}
