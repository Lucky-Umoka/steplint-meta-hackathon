import type { ProcedureSpec } from "./schema";
import type { ScenePredicate } from "./execution-v3";

/**
 * Final-goal completion gate (Phase 5). Deterministic and model-free.
 *
 * Completion requires every approved step passed AND every approved V3 final
 * predicate passing on fresh, confident evidence for the approved settle time,
 * with no unresolved identity and a running (not paused/stopped) session.
 * Each predicate is pass / fail / unknown. Only a reliable `fail` invalidates
 * an earlier completion; unknown evidence never does. Older (V2) lessons keep
 * their existing step-only completion.
 */
type Box = { left: number; top: number; right: number; bottom: number };
export type GoalObservation = {
  timestampMs: number;
  quality: string;
  confidence: number | null;
  box: Box | null;
};
export type PredicateVerdict = {
  id: string;
  kind: ScenePredicate["kind"] | "unsupported";
  verdict: "pass" | "fail" | "unknown";
  reason: string;
  observedAtMs: number | null;
};
export type GoalStatus =
  | "incomplete"
  | "verifying_goal"
  | "complete"
  | "invalidated";
export type GoalAuditEvent = {
  type: "complete" | "invalidated";
  atMs: number;
  revision: string | null;
  reason: string;
  predicates: PredicateVerdict[];
};
export type GoalState = {
  status: GoalStatus;
  revision: string | null;
  passSinceMs: number | null;
  completedAtMs: number | null;
  /** Completed earlier but the current view is unclear (not a reversal). */
  uncertain: boolean;
  predicates: PredicateVerdict[];
  reason: string;
  audit: GoalAuditEvent[];
};
export type GoalPolicy = {
  freshMs: number;
  minConfidence: number;
  holdMs: number;
};

export function initialGoal(procedure: ProcedureSpec): GoalState {
  return {
    status: "incomplete",
    revision: procedure.approval?.revision ?? null,
    passSinceMs: null,
    completedAtMs: null,
    uncertain: false,
    predicates: [],
    reason: "Approved steps are not all verified yet.",
    audit: [],
  };
}
/** Approved policy values from the procedure's own step measurements. */
export function goalPolicy(procedure: ProcedureSpec): GoalPolicy {
  const steps = procedure.steps;
  const goalIds =
    procedure.execution?.schemaVersion === 3
      ? procedure.execution.goalStepIds
      : steps.map((s) => s.id);
  const goalSteps = steps.filter((s) => goalIds.includes(s.id));
  return {
    freshMs: Math.min(
      ...steps.map((s) => s.measurement?.maxObservationGapMs ?? 600),
    ),
    minConfidence: Math.max(...steps.map((s) => s.condition.minimumConfidence)),
    holdMs: Math.max(
      0,
      ...goalSteps.map((s) => s.measurement?.stableForMs ?? 400),
    ),
  };
}
const centre = (b: Box) => ({
  x: (b.left + b.right) / 2,
  y: (b.top + b.bottom) / 2,
});
// Same strict-inside margin the Practice pipeline uses for zone membership.
const inside = (r: Box, p: { x: number; y: number }) =>
  p.x > r.left + 0.01 &&
  p.x < r.right - 0.01 &&
  p.y > r.top + 0.01 &&
  p.y < r.bottom - 0.01;
const outside = (r: Box, p: { x: number; y: number }) =>
  p.x < r.left - 0.01 ||
  p.x > r.right + 0.01 ||
  p.y < r.top - 0.01 ||
  p.y > r.bottom + 0.01;

export function evaluatePredicate(
  predicate: ScenePredicate | { id: string; kind: string },
  latest: Record<string, GoalObservation | undefined>,
  zones: Record<string, Box>,
  nowMs: number,
  policy: GoalPolicy,
): PredicateVerdict {
  const unknown = (
    reason: string,
    at: number | null = null,
  ): PredicateVerdict => ({
    id: predicate.id,
    kind:
      predicate.kind === "object_in_zone" ||
      predicate.kind === "projected_separation"
        ? predicate.kind
        : "unsupported",
    verdict: "unknown",
    reason,
    observedAtMs: at,
  });
  const reliable = (objectId: string | undefined) => {
    const observation = objectId ? latest[objectId] : undefined;
    if (!observation)
      return { error: `${objectId ?? "object"} not observed yet` };
    if (nowMs - observation.timestampMs > policy.freshMs)
      return { error: `${objectId} evidence is stale` };
    if (
      observation.quality !== "observed" ||
      !observation.box ||
      observation.confidence === null ||
      observation.confidence < policy.minConfidence
    )
      return { error: `${objectId} identity or position is uncertain` };
    return { observation };
  };
  if (
    predicate.kind === "object_in_zone" &&
    "objectId" in predicate &&
    "zoneId" in predicate
  ) {
    const region = zones[predicate.zoneId];
    if (!region)
      return unknown(`approved zone ${predicate.zoneId} is not bound`);
    const r = reliable(predicate.objectId);
    if (!r.observation) return unknown(r.error);
    const point = centre(r.observation.box!);
    const at = r.observation.timestampMs;
    if (inside(region, point))
      return {
        id: predicate.id,
        kind: "object_in_zone",
        verdict: "pass",
        reason: `${predicate.objectId} is in ${predicate.zoneId}`,
        observedAtMs: at,
      };
    // Near the boundary is not proof either way.
    return outside(region, point)
      ? {
          id: predicate.id,
          kind: "object_in_zone",
          verdict: "fail",
          reason: `${predicate.objectId} is outside ${predicate.zoneId}`,
          observedAtMs: at,
        }
      : unknown(
          `${predicate.objectId} is at the edge of ${predicate.zoneId}`,
          at,
        );
  }
  if (
    predicate.kind === "projected_separation" &&
    "objectId" in predicate &&
    "otherObjectId" in predicate &&
    typeof predicate.minimumGap === "number"
  ) {
    const a = reliable(predicate.objectId),
      b = reliable(predicate.otherObjectId);
    if (!a.observation) return unknown(a.error);
    if (!b.observation) return unknown(b.error);
    const box = a.observation.box!,
      other = b.observation.box!;
    // Same projected gap Teach used to approve the predicate.
    const gap = Math.hypot(
      Math.max(other.left - box.right, box.left - other.right, 0),
      Math.max(other.top - box.bottom, box.top - other.bottom, 0),
    );
    const at = Math.min(a.observation.timestampMs, b.observation.timestampMs);
    return gap >= predicate.minimumGap
      ? {
          id: predicate.id,
          kind: "projected_separation",
          verdict: "pass",
          reason: `gap ${gap.toFixed(3)} ≥ ${predicate.minimumGap}`,
          observedAtMs: at,
        }
      : {
          id: predicate.id,
          kind: "projected_separation",
          verdict: "fail",
          reason: `gap ${gap.toFixed(3)} < ${predicate.minimumGap}`,
          observedAtMs: at,
        };
  }
  return unknown("unsupported or incomplete final predicate");
}

export function updateGoal(
  state: GoalState,
  input: {
    procedure: ProcedureSpec;
    stepsPassed: boolean;
    /** A step reliably failed (reversal/wrong action), not merely uncertain. */
    stepFailed?: boolean;
    latest: Record<string, GoalObservation | undefined>;
    zones: Record<string, Box>;
    nowMs: number;
    /** Required identities currently occluded/reacquiring/needing a view. */
    unresolvedIdentities: string[];
    /** Session running and armed (not paused, stopped or blocked). */
    sessionReady: boolean;
  },
): GoalState {
  const { procedure, nowMs } = input;
  const revision = procedure.approval?.revision ?? null;
  // A completion belongs to one approved revision only.
  if (revision !== state.revision) state = { ...initialGoal(procedure) };
  const execution = procedure.execution;
  const predicates =
    execution?.schemaVersion === 3 ? execution.finalConditions : [];
  const policy = goalPolicy(procedure);
  const verdicts = predicates.map((p) =>
    evaluatePredicate(p, input.latest, input.zones, nowMs, policy),
  );
  const next: GoalState = { ...state, predicates: verdicts, uncertain: false };
  const invalidate = (reason: string): GoalState => ({
    ...next,
    status: "invalidated",
    passSinceMs: null,
    reason,
    audit: [
      ...state.audit,
      {
        type: "invalidated",
        atMs: nowMs,
        revision,
        reason,
        predicates: verdicts,
      },
    ],
  });
  if (!input.stepsPassed) {
    if (state.status === "complete" && input.stepFailed)
      return invalidate("A required step was reversed or failed.");
    if (state.status === "complete")
      // Uncertain step evidence (e.g. a hand covering the object) is not a reversal.
      return {
        ...next,
        status: "complete",
        uncertain: true,
        reason: "A verified step is temporarily not visible.",
      };
    return {
      ...next,
      status: state.status === "invalidated" ? "invalidated" : "incomplete",
      passSinceMs: null,
      reason: "Approved steps are not all verified yet.",
    };
  }
  const failed = verdicts.find((v) => v.verdict === "fail");
  if (failed && state.status === "complete")
    return invalidate(`Final goal reversed: ${failed.reason}.`);
  const blockers = [
    ...input.unresolvedIdentities.map((id) => `${id} needs to be found again`),
    ...(input.sessionReady ? [] : ["Practice is not running"]),
  ];
  const unknown = verdicts.find((v) => v.verdict === "unknown");
  if (failed || unknown || blockers.length) {
    if (state.status === "complete")
      // Unknown evidence is not a reversal: keep completion, flag the view.
      return {
        ...next,
        status: "complete",
        uncertain: true,
        reason: unknown?.reason ?? blockers[0] ?? "",
      };
    return {
      ...next,
      // An invalidation stays visible until the goal is verified again.
      status: state.status === "invalidated" ? "invalidated" : "verifying_goal",
      passSinceMs: null,
      reason: failed?.reason ?? unknown?.reason ?? blockers[0],
    };
  }
  if (state.status === "complete")
    return { ...next, reason: "Final goal verified and still holding." };
  const passSinceMs = state.passSinceMs ?? nowMs;
  if (nowMs - passSinceMs < policy.holdMs)
    return {
      ...next,
      status: "verifying_goal",
      passSinceMs,
      reason: "Final goal observed; confirming it stays in place.",
    };
  return {
    ...next,
    status: "complete",
    passSinceMs,
    completedAtMs: nowMs,
    reason: "Final goal verified.",
    audit: [
      ...state.audit,
      {
        type: "complete",
        atMs: nowMs,
        revision,
        reason: "All steps passed and the final goal held on fresh evidence.",
        predicates: verdicts,
      },
    ],
  };
}
/** The learner-facing completion: V2 lessons keep step-only completion. */
export function isProcedureComplete(
  procedure: ProcedureSpec,
  goal: GoalState,
  stepsPassed: boolean,
) {
  return procedure.execution?.schemaVersion === 3
    ? goal.status === "complete" && !goal.uncertain
    : stepsPassed;
}
