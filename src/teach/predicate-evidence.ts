import type { TeachContext, TeachDraft } from "./schema";
import type { ScenePredicate } from "../procedure/execution-v3";
import {
  sampleDisplacement,
  TEACH_REST_MAX_DRIFT,
  trustedSourceSample,
} from "./source-evidence";

/**
 * Keep V3 initial/final scene predicates consistent with the measured action
 * endpoints that the reviewed zones are derived from.
 *
 * A predicate may cite a clearer moment than the action endpoint (before the
 * move, or after a hand clears the result); that remains accepted when the
 * moved object is at the same resting position (within the Teach rest drift).
 * A cited frame that shows the moved object elsewhere (lifted, held, or
 * nudged after landing) contradicts the zone the reviewer approves, and
 * approval would block with nothing the reviewer can fix. Only then the
 * phase's predicates are bound to the measured boundary frame: the first
 * action's at-rest start (initial) or the last action's at-rest result
 * (final), provided every predicate object has a trusted sample there.
 * Otherwise the draft is unchanged. Nothing is accepted here: validateDraft
 * and validateReviewEvidence still check every predicate.
 */
export function alignScenePredicateEvidence(
  draft: TeachDraft,
  context: Pick<TeachContext, "tracking" | "lesson">,
): TeachDraft {
  const execution = draft.procedure.execution;
  const steps = draft.procedure.steps;
  if (execution?.schemaVersion !== 3 || !steps.length) return draft;
  const first = steps[0].execution?.evidenceWindow.startFrame;
  const last = steps.at(-1)!.execution?.evidenceWindow.resultFrame;
  if (first === undefined || last === undefined) return draft;
  const times = context.lesson.media.frameTimesMs;
  const sample = (objectId: string, frame: number) =>
    context.tracking
      .find((track) => track.componentId === objectId)
      ?.samples.find(
        (s) => s.frame === frame && trustedSourceSample(s, times),
      );
  const objectsOf = (p: ScenePredicate) =>
    p.kind === "projected_separation"
      ? [p.objectId, p.otherObjectId]
      : [p.objectId];
  /** The measured endpoint a predicate's zone is reviewed from, if any. */
  const endpoint = (p: ScenePredicate, phase: "initial" | "final") => {
    if (p.kind !== "object_in_zone") return null;
    const moves = steps.filter((s) => s.condition.componentId === p.objectId);
    const step = phase === "initial" ? moves[0] : moves.at(-1);
    const window = step?.execution?.evidenceWindow;
    if (!step || !window) return null;
    if (phase === "initial" && step.condition.fromZone === p.zoneId)
      return sample(p.objectId, window.startFrame) ?? null;
    if (phase === "final" && step.condition.toZone === p.zoneId)
      return sample(p.objectId, window.resultFrame) ?? null;
    return null;
  };
  const align = (
    predicates: ScenePredicate[],
    boundary: number,
    phase: "initial" | "final",
  ) => {
    const contradicted = predicates.some((p) => {
      const rest = endpoint(p, phase);
      if (!rest) return false;
      return p.evidenceFrames.some((frame) => {
        const cited = sample(p.objectId, frame);
        return (
          !!cited && sampleDisplacement(rest, cited) > TEACH_REST_MAX_DRIFT
        );
      });
    });
    if (
      !contradicted ||
      !predicates.every((p) =>
        objectsOf(p).every((id) => sample(id, boundary)),
      )
    )
      return predicates;
    return predicates.map((p) => ({ ...p, evidenceFrames: [boundary] }));
  };
  const initialConditions = align(execution.initialConditions, first, "initial");
  const finalConditions = align(execution.finalConditions, last, "final");
  if (
    initialConditions === execution.initialConditions &&
    finalConditions === execution.finalConditions
  )
    return draft;
  // The video review's goal cites the same final scene, and validation
  // requires its frames to be shared by every final condition: move it with
  // them, or a realigned draft would be rejected as inconsistent (live run 6).
  const videoReview =
    finalConditions !== execution.finalConditions && draft.videoReview
      ? {
          ...draft.videoReview,
          goal: { ...draft.videoReview.goal, evidenceFrames: [last] },
        }
      : draft.videoReview;
  return {
    ...draft,
    ...(videoReview ? { videoReview } : {}),
    procedure: {
      ...draft.procedure,
      execution: { ...execution, initialConditions, finalConditions },
    },
  };
}
