import { z } from "zod";
import {
  ProcedureSpecSchema,
  type InputEvent,
  type ProcedureSpec,
} from "../procedure/schema";
import { createVerifier } from "../procedure/verifier";
import { RegionSchema, type Region } from "../teach/schema";
import type { Detection } from "./tracker";
export const ZoneBindingsSchema = z
  .array(z.strictObject({ zoneId: z.string().min(1), region: RegionSchema }))
  .min(2)
  .max(100);
export type ZoneBinding = z.infer<typeof ZoneBindingsSchema>[number];
export function validateSetup(
  procedure: ProcedureSpec,
  bindings: ZoneBinding[],
) {
  ZoneBindingsSchema.parse(bindings);
  const required = new Set(
    procedure.steps
      .flatMap((s) => [
        s.condition,
        ...s.forbiddenTransitions.map((r) => r.condition),
      ])
      .flatMap((c) => [c.fromZone, c.toZone])
      .concat(
        procedure.steps.flatMap((s) => s.measurement?.forbiddenZoneIds ?? []),
      ),
  );
  if (
    new Set(bindings.map((b) => b.zoneId)).size !== bindings.length ||
    [...required].some((id) => !bindings.some((b) => b.zoneId === id)) ||
    bindings.some((b) => !procedure.zones.some((z) => z.id === b.zoneId))
  )
    throw new Error("Draw every rule's approved zone exactly once.");
  for (const condition of procedure.steps.flatMap((s) => [
    s.condition,
    ...s.forbiddenTransitions.map((r) => r.condition),
  ])) {
    const from = bindings.find((b) => b.zoneId === condition.fromZone)?.region;
    const to = bindings.find((b) => b.zoneId === condition.toZone)?.region;
    if (
      !from ||
      !to ||
      (Math.max(from.left, to.left) < Math.min(from.right, to.right) &&
        Math.max(from.top, to.top) < Math.min(from.bottom, to.bottom))
    )
      throw new Error("A step's start and target regions must not overlap.");
  }
}
type Stable = {
  zone: string | null;
  quality: string;
  candidateSince: number;
  count: number;
  lastEmit: number;
  lastSeen: number;
  emittedKey: string;
  originAt?: number;
  originFrame?: string;
  onsetFrame?: string;
  center?: { x: number; y: number };
  candidatePoint?: { x: number; y: number };
};
export type PracticeSession = {
  procedure: ProcedureSpec;
  bindings: ZoneBinding[];
  events: InputEvent[];
  stable: Record<string, Stable>;
  sequence: number;
  lastTimestamp: number;
  stopped: boolean;
  verifier: ReturnType<typeof createVerifier>;
  result: ReturnType<ReturnType<typeof createVerifier>["snapshot"]>;
  id: string;
  armed: boolean;
  initialZones: Record<string, string>;
  calibrations: {
    epoch: number;
    timestampMs: number;
    bindings: ZoneBinding[];
    humanConfirmed: true;
  }[];
};
export function createSession(
  input: unknown,
  bindings: ZoneBinding[],
  calibrationAtMs = 0,
): PracticeSession {
  if (!Number.isFinite(calibrationAtMs) || calibrationAtMs < 0)
    throw Error("Invalid calibration time.");
  const procedure = ProcedureSpecSchema.parse(input);
  if (!procedure.approval)
    throw new Error("Human-approved procedure required.");
  validateSetup(procedure, bindings);
  const verifier = createVerifier(procedure);
  return {
    procedure,
    bindings: structuredClone(bindings),
    events: [],
    stable: Object.create(null) as Record<string, Stable>,
    sequence: 0,
    lastTimestamp: -1,
    stopped: false,
    verifier,
    result: verifier.snapshot(),
    id: `session-${globalThis.crypto.randomUUID()}`,
    armed: !procedure.execution,
    initialZones: Object.fromEntries(
      procedure.steps
        .filter(
          (s, i, all) =>
            all.findIndex(
              (step) => step.condition.componentId === s.condition.componentId,
            ) === i,
        )
        .map((s) => [s.condition.componentId, s.condition.fromZone]),
    ),
    calibrations: [
      {
        epoch: 1,
        timestampMs: Math.floor(calibrationAtMs),
        bindings: structuredClone(bindings),
        humanConfirmed: true,
      },
    ],
  };
}
const contains = (r: Region, x: number, y: number) =>
  x > r.left + 0.01 &&
  x < r.right - 0.01 &&
  y > r.top + 0.01 &&
  y < r.bottom - 0.01;
/** Minimum three fresh frames spanning 400ms. Uncertainty invalidates immediately. */
export function feedDetection(
  session: PracticeSession,
  detection: Detection,
  nowMs: number,
  frameId?: string,
) {
  if (session.stopped)
    throw new Error("Session paused; reset and recalibrate before continuing.");
  if (!Number.isFinite(nowMs) || nowMs < 0)
    throw new Error("Invalid observation time.");
  const matches = session.procedure.steps.filter(
    (s) => s.condition.componentId === detection.componentId,
  );
  const step = session.procedure.execution
    ? (matches.find(
        (s) =>
          session.result.steps.find((state) => state.stepId === s.id)
            ?.status !== "passed",
      ) ?? matches.at(-1))
    : matches[0];
  if (!step) throw new Error("Unknown tracked component.");
  const priorFrame = session.stable[detection.componentId];
  if (
    priorFrame &&
    nowMs - priorFrame.lastSeen > (step.measurement?.maxObservationGapMs ?? 600)
  )
    detection = {
      componentId: detection.componentId,
      quality: "missing",
      center: null,
      score: null,
      reason: "Tracking frame gap; a fresh starting state must be observed.",
    };
  let quality = detection.quality;
  if (detection.identityOnly && !session.procedure.execution)
    quality = "ambiguous";
  let zone: string | null = null;
  if (quality === "observed") {
    if (
      (!detection.center && !detection.identityOnly) ||
      detection.score === null ||
      !Number.isFinite(detection.score) ||
      detection.score < step.condition.minimumConfidence
    )
      quality = "ambiguous";
    else if (!detection.identityOnly) {
      // Shared/overlapping targets for OTHER components do not determine this object's zone.
      const relevant = new Set([
        step.condition.fromZone,
        step.condition.toZone,
        ...(step.measurement?.forbiddenZoneIds ?? []),
        ...step.forbiddenTransitions.flatMap((r) => [
          r.condition.fromZone,
          r.condition.toZone,
        ]),
      ]);
      const matches = session.bindings.filter(
        (b) =>
          relevant.has(b.zoneId) &&
          contains(b.region, detection.center!.x, detection.center!.y),
      );
      if (matches.length === 1) zone = matches[0].zoneId;
      else {
        const prior = session.stable[detection.componentId];
        if (session.procedure.execution && matches.length === 0) {
          // Valid measured transit is not missing evidence. The verifier keeps
          // the last clear origin until visibility, identity or freshness fails.
          zone = null;
        } else {
          // Brief, continuously visible travel through unassigned space is not an action.
          // Only preserve a known starting observation; target loss never gets this grace.
          if (
            matches.length === 0 &&
            prior?.emittedKey === `observed:${step.condition.fromZone}` &&
            nowMs - prior.lastEmit < 1200 &&
            nowMs > prior.lastSeen
          ) {
            prior.lastSeen = nowMs;
            prior.count = 0;
            prior.candidateSince = nowMs;
            return { result: null, emitted: false, detectedAtMs: nowMs };
          }
          quality = "ambiguous";
        }
      }
    }
  }
  if (!session.armed && quality === "observed") {
    const initial = session.procedure.steps.find(
      (s) => s.condition.componentId === detection.componentId,
    )!;
    if (
      zone !==
      (session.initialZones[detection.componentId] ??
        initial.condition.fromZone)
    ) {
      quality = "ambiguous";
      zone = null;
    }
  }
  const key = `${quality}:${zone}`;
  let stable = session.stable[detection.componentId];
  if (stable && nowMs <= stable.lastSeen)
    return { result: null, emitted: false, detectedAtMs: nowMs }; // stale frame
  if (!stable || stable.quality !== quality || stable.zone !== zone) {
    stable = {
      zone,
      quality,
      candidateSince: nowMs,
      count: 0,
      lastEmit: stable?.lastEmit ?? -1,
      lastSeen: nowMs,
      emittedKey: stable?.emittedKey ?? "",
      originAt: quality === "observed" ? stable?.originAt : undefined,
      originFrame: quality === "observed" ? stable?.originFrame : undefined,
      onsetFrame: frameId,
      center: stable?.center,
      candidatePoint: detection.center ?? undefined,
    };
    session.stable[detection.componentId] = stable;
  }
  if (
    session.procedure.execution &&
    quality === "observed" &&
    zone === step.condition.toZone &&
    stable.candidatePoint &&
    detection.center &&
    Math.hypot(
      detection.center.x - stable.candidatePoint.x,
      detection.center.y - stable.candidatePoint.y,
    ) > (step.measurement?.maximumPositionDrift ?? 0.01)
  ) {
    // Endpoint dwell belongs to this object only. Other objects/the learner can
    // keep moving; travelling through a large target is not the final state.
    stable.candidateSince = nowMs;
    stable.count = 0;
    stable.onsetFrame = frameId;
    stable.candidatePoint = { ...detection.center };
  }
  const priorCenter = stable.center;
  const elapsedMs = priorFrame ? nowMs - priorFrame.lastSeen : 0;
  stable.lastSeen = nowMs;
  stable.center =
    quality === "observed" ? (detection.center ?? undefined) : undefined;
  stable.count++;
  if (quality === "observed" && zone === step.condition.fromZone) {
    stable.originAt = nowMs;
    stable.originFrame = frameId;
  }
  const uncertain = quality !== "observed";
  const ready =
    uncertain ||
    (!!session.procedure.execution &&
      quality === "observed" &&
      zone === null) ||
    (stable.count >= (step.measurement?.minimumFreshFrames ?? 3) &&
      nowMs - stable.candidateSince >= (step.measurement?.stableForMs ?? 400));
  const emit =
    ready &&
    (stable.emittedKey !== key ||
      nowMs - stable.lastEmit >= (uncertain ? 1500 : 250));
  if (emit) {
    if (session.events.length >= 9500) {
      session.stopped = true;
      throw new Error("Session event limit reached. Export the log and reset.");
    }
    const timestampMs = Math.max(Math.floor(nowMs), session.lastTimestamp + 1);
    session.lastTimestamp = timestampMs;
    const id = `practice-${++session.sequence}`;
    session.events.push({
      type: "observation",
      id,
      timestampMs,
      observation: {
        id,
        objectId: detection.componentId,
        timestampMs,
        quality,
        zone,
        confidence: detection.score,
        location: detection.center,
        ...(session.procedure.execution
          ? {
              identityOnly: !!detection.identityOnly && quality === "observed",
              visibleFraction: detection.visibleFraction,
              spatialState:
                zone === null && quality === "observed"
                  ? ("transit" as const)
                  : ("zone" as const),
              onsetMs: Math.floor(stable.candidateSince),
              sourceObservedAtMs:
                stable.originAt === undefined
                  ? undefined
                  : Math.floor(
                      Math.min(stable.originAt, stable.candidateSince),
                    ),
              frameId,
              pendingPrerequisites: session.procedure.steps
                .slice(0, session.procedure.steps.indexOf(step))
                .filter((prior) => {
                  const pending = session.stable[prior.condition.componentId];
                  return (
                    pending?.zone === prior.condition.toZone &&
                    pending.quality === "observed" &&
                    pending.candidateSince <= (stable.originAt ?? -1)
                  );
                })
                .map((prior) => prior.id),
            }
          : {}),
        evidence: {
          sourceId: session.procedure.execution
            ? `${session.id}:calibration-${session.calibrations.length}`
            : "local-camera-session",
          timestampMs,
          description: detection.reason,
        },
      },
    });
    stable.lastEmit = nowMs;
    stable.emittedKey = key;
  }
  if (emit) session.result = session.verifier.push(session.events.at(-1)!);
  if (!session.armed) {
    const firstSteps = session.procedure.steps.filter(
      (s, i, all) =>
        all.findIndex(
          (candidate) =>
            candidate.condition.componentId === s.condition.componentId,
        ) === i,
    );
    session.armed = firstSteps.every((initial) => {
      const state = session.stable[initial.condition.componentId];
      return (
        !!state &&
        state.quality === "observed" &&
        state.zone ===
          (session.initialZones[initial.condition.componentId] ??
            initial.condition.fromZone) &&
        state.count >= (initial.measurement?.minimumFreshFrames ?? 3) &&
        nowMs - state.candidateSince >=
          (initial.measurement?.stableForMs ?? 400) &&
        nowMs - state.lastSeen <=
          (initial.measurement?.maxObservationGapMs ?? 600)
      );
    });
  }
  const needsEarlier = session.procedure.steps
    .slice(0, session.procedure.steps.indexOf(step))
    .some((prior) => {
      if (
        session.result.steps.find((s) => s.stepId === prior.id)?.status ===
        "passed"
      )
        return false;
      const candidate = session.stable[prior.condition.componentId];
      return !(
        candidate?.quality === "observed" &&
        candidate.zone === prior.condition.toZone &&
        candidate.candidateSince <= (stable.originAt ?? -1)
      );
    });
  // Forecasts are amber advisories only and never enter the verifier log.
  const approachZones = new Set([
    ...(step.measurement?.forbiddenZoneIds ?? []),
    ...(needsEarlier ? [step.condition.toZone] : []),
  ]);
  const approaching =
    !!session.procedure.execution &&
    quality === "observed" &&
    priorCenter &&
    detection.center &&
    elapsedMs > 0 &&
    elapsedMs <= 200 &&
    session.bindings.some((binding) => {
      if (!approachZones.has(binding.zoneId)) return false;
      const vx = (detection.center!.x - priorCenter.x) / elapsedMs,
        vy = (detection.center!.y - priorCenter.y) / elapsedMs;
      const predicted = {
        x: detection.center!.x + vx * 150,
        y: detection.center!.y + vy * 150,
      };
      return (
        Math.hypot(vx, vy) > 0.00005 &&
        !contains(binding.region, detection.center!.x, detection.center!.y) &&
        contains(binding.region, predicted.x, predicted.y)
      );
    });
  const warning =
    !!session.procedure.execution &&
    quality === "observed" &&
    (detection.identityOnly ||
      approaching ||
      (zone === step.condition.toZone && needsEarlier) ||
      (step.measurement?.forbiddenZoneIds.includes(zone ?? "") ?? false) ||
      (session.result.steps.find((s) => s.stepId === step.id)?.status ===
        "passed" &&
        zone !== step.condition.toZone));
  return {
    result: emit ? session.result : null,
    emitted: emit,
    detectedAtMs: stable.candidateSince,
    warning: warning
      ? {
          stepId: step.id,
          instruction: detection.identityOnly
            ? "Keep the whole object visible. Its endpoint cannot be verified from this partial outline."
            : step.recovery.instruction,
        }
      : null,
    evidenceFrames: [stable.originFrame, stable.onsetFrame, frameId].filter(
      (id): id is string => !!id,
    ),
  };
}
export function controlSession(
  session: PracticeSession,
  action: "reset" | "retry",
  nowMs: number,
  stepId?: string,
) {
  if (
    action === "retry" &&
    !session.procedure.steps.some((s) => s.id === stepId)
  )
    throw new Error("Unknown retry step.");
  const timestampMs = Math.max(Math.floor(nowMs), session.lastTimestamp + 1),
    id = `practice-${++session.sequence}`;
  session.events.push(
    action === "reset"
      ? { type: "reset", id, timestampMs }
      : { type: "retry", id, timestampMs, stepId: stepId! },
  );
  session.lastTimestamp = timestampMs;
  session.stable = Object.create(null) as Record<string, Stable>;
  if (action === "reset") {
    session.stopped = false;
    session.armed = !session.procedure.execution;
  }
  session.result = session.verifier.push(session.events.at(-1)!);
  return session.result;
}

/** Explicitly confirmed recalibration after pause. Prior actions/audit remain;
 * all current states require fresh evidence, and unfinished actions need a new origin. */
export function resumeSession(
  session: PracticeSession,
  bindings: ZoneBinding[],
  nowMs: number,
) {
  if (!Number.isFinite(nowMs) || nowMs < 0)
    throw Error("Invalid calibration time.");
  if (!session.stopped || !session.procedure.execution)
    throw Error("Only a paused local session can resume.");
  if (session.calibrations.length >= 20)
    throw Error(
      "Calibration limit reached. Export the audit and start a new attempt.",
    );
  validateSetup(session.procedure, bindings);
  const ids = [
    ...new Set(
      session.procedure.steps.map((step) => step.condition.componentId),
    ),
  ];
  session.initialZones = session.verifier.expectedResumeZones();
  session.bindings = structuredClone(bindings);
  session.stable = Object.create(null) as Record<string, Stable>;
  session.stopped = false;
  session.armed = false;
  session.calibrations.push({
    epoch: session.calibrations.length + 1,
    timestampMs: Math.floor(nowMs),
    bindings: structuredClone(bindings),
    humanConfirmed: true,
  });
  for (const id of ids)
    feedDetection(
      session,
      {
        componentId: id,
        quality: "missing",
        center: null,
        score: null,
        reason:
          "Resuming after a confirmed calibration: require fresh state and identity evidence.",
      },
      nowMs,
    );
  return session;
}
