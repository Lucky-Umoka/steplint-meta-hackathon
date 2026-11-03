import type { ProcedureSpec } from "../procedure/schema";
import type { TeachContext, TeachDraft } from "./schema";
import {
  actionWindowIssue,
  MINIMUM_TEACH_TRANSFER_DISPLACEMENT,
  sampleDisplacement,
  sourceEvidenceCatalog,
  trustedSourceSample,
} from "./source-evidence";

/** Pure source checks: valid JSON and frame indices do not prove a measured action. */
/**
 * Final-goal consistency with the measured actions (owner report: the goal
 * named an intermediate move or place). Never repaired silently: the issue
 * goes to the single correction request, then to human review.
 */
export function finalGoalIssue(procedure: ProcedureSpec): string | null {
  const execution = procedure.execution;
  if (execution?.schemaVersion !== 3) return null;
  const last = new Map<string, ProcedureSpec["steps"][number]>();
  for (const step of procedure.steps) last.set(step.condition.componentId, step);
  for (const p of execution.finalConditions) {
    if (p.kind !== "object_in_zone") continue;
    const step = last.get(p.objectId);
    if (step && step.condition.toZone !== p.zoneId)
      return `Final goal names ${p.objectId} in "${p.zoneId}", but its last measured action "${step.id}" ends in "${step.condition.toZone}". The final condition must be where the object finally rests; correct finalConditions (and its requirement links).`;
  }
  // Intermediate goal steps are rejected by the procedure schema with its own
  // actionable "remove … from goalStepIds" message.
  return null;
}
export function validateV3Evidence(
  draft: TeachDraft,
  context: TeachContext,
): void {
  const procedure: ProcedureSpec = draft.procedure;
  const execution = procedure.execution;
  if (execution?.schemaVersion !== 3) return;
  const goalIssue = finalGoalIssue(procedure);
  if (goalIssue) throw Error(goalIssue);
  const times = context.lesson.media.frameTimesMs;
  const measuredWindowHint = (objectId: string) => {
    const entry = sourceEvidenceCatalog(context).find(
      (item) => item.componentId === objectId,
    );
    const windows =
      entry?.displacementWindows.map(
        (w) => `${w.startFrame}-${w.resultFrame}`,
      ) ?? [];
    return windows.length
      ? `Measured movement windows for this object: ${windows.slice(0, 8).join(", ")}.`
      : `This object has no measured movement window (${entry?.movementDiagnosis ?? "no reliable tracking"}); mark the action unsupported.`;
  };
  const sample = (objectId: string, frame: number) => {
    const value = context.tracking
      .find((t) => t.componentId === objectId)
      ?.samples.find((s) => s.frame === frame);
    if (!value || !trustedSourceSample(value, times))
      throw Error(
        `Unsupported source evidence for ${objectId} at frame ${frame}: ${!value ? "no tracked observation" : value.timestampMs !== times[frame] ? "source timestamp mismatch" : "tracking score below 0.90 or unavailable"}. Use only this object's eligible source frames; video visibility alone is not a tracking measurement.`,
      );
    return value;
  };
  for (const object of procedure.components)
    for (const frame of object.execution!.referenceFrames)
      sample(object.id, frame);
  for (const step of procedure.steps) {
    const window = step.execution!.evidenceWindow;
    const frames = [window.startFrame, window.changeFrame, window.resultFrame];
    const notes = draft.notes.find((note) => note.stepId === step.id);
    if (!frames.every((frame) => notes?.supportingFrames.includes(frame)))
      throw Error(
        "The action window must be grounded in its own supporting frames.",
      );
    const measured = frames.map((frame) =>
      sample(step.condition.componentId, frame),
    );
    if (
      !(
        measured[0].timestampMs < measured[1].timestampMs &&
        measured[1].timestampMs < measured[2].timestampMs
      )
    )
      throw Error("Action evidence timestamps must be ordered.");
    if (
      sampleDisplacement(measured[0], measured[2]) <
      MINIMUM_TEACH_TRANSFER_DISPLACEMENT
    ) {
      throw Error(
        `Unsupported transfer for ${step.id} (${step.condition.componentId}, frames ${window.startFrame}-${window.resultFrame}): tracked box centre moved less than ${MINIMUM_TEACH_TRANSFER_DISPLACEMENT}. ${measuredWindowHint(step.condition.componentId)}`,
      );
    }
    // Same window rule Teach approval enforces (validateReviewEvidence): an
    // at-rest start and result, with tracking gaps no longer than the policy.
    const trustedMover = (
      context.tracking.find((t) => t.componentId === step.condition.componentId)
        ?.samples ?? []
    )
      .filter((s) => trustedSourceSample(s, times))
      .sort((a, b) => a.frame - b.frame);
    const windowIssue = actionWindowIssue(
      trustedMover,
      window.startFrame,
      window.resultFrame,
    );
    if (windowIssue)
      throw Error(
        `Action window for ${step.id} (${step.condition.componentId}, frames ${window.startFrame}-${window.resultFrame}): ${windowIssue}. ${measuredWindowHint(step.condition.componentId)}`,
      );
    for (const objectId of step.execution!.requiredObjectIds) {
      // Later visibility is allowed; only this action's required identities gate its evidence.
      sample(objectId, window.startFrame);
      sample(objectId, window.resultFrame);
    }
  }
  const firstFrame = procedure.steps[0].execution!.evidenceWindow.startFrame;
  const lastFrame =
    procedure.steps.at(-1)!.execution!.evidenceWindow.resultFrame;
  for (const [predicates, boundary, phase] of [
    [execution.initialConditions, firstFrame, "initial"],
    [execution.finalConditions, lastFrame, "final"],
  ] as const) {
    const eligible = (frame: number) =>
      phase === "initial" ? frame <= boundary : frame >= boundary;
    // A scene is shared in time, not necessarily identical to an action endpoint:
    // the clearest view may precede movement or follow a hand clearing the result.
    const commonFrames = predicates[0].evidenceFrames.filter(
      (frame) =>
        eligible(frame) &&
        predicates.every((predicate) =>
          predicate.evidenceFrames.includes(frame),
        ),
    );
    if (
      !commonFrames.length ||
      predicates.some((predicate) =>
        predicate.evidenceFrames.some((frame) => !eligible(frame)),
      )
    )
      throw Error(
        `Scene predicates require shared initial/final scene evidence: ${phase} conditions must share an observed frame ${phase === "initial" ? "at or before action start" : "at or after action result"} frame ${boundary}. Unrelated moments cannot establish a complete scene.`,
      );
    for (const predicate of predicates) {
      for (const frame of predicate.evidenceFrames) {
        const observed = sample(predicate.objectId, frame);
        if (predicate.kind === "projected_separation") {
          const other = sample(predicate.otherObjectId, frame).box;
          const box = observed.box;
          const gap = Math.hypot(
            Math.max(other.left - box.right, box.left - other.right, 0),
            Math.max(other.top - box.bottom, box.top - other.bottom, 0),
          );
          if (gap < predicate.minimumGap)
            throw Error(
              "Unsupported projected-separation goal in source evidence.",
            );
        }
      }
    }
  }
}
