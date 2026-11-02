import type { ProcedureSpec } from "../procedure/schema";
import type { TeachContext, TeachDraft } from "./schema";

/** Pure source checks: valid JSON and frame indices do not prove a measured action. */
export function validateV3Evidence(
  draft: TeachDraft,
  context: TeachContext,
): void {
  const procedure: ProcedureSpec = draft.procedure;
  const execution = procedure.execution;
  if (execution?.schemaVersion !== 3) return;
  const times = context.lesson.media.frameTimesMs;
  const sample = (objectId: string, frame: number) => {
    const value = context.tracking
      .find((t) => t.componentId === objectId)
      ?.samples.find((s) => s.frame === frame);
    if (
      times[frame] === undefined ||
      !value ||
      value.timestampMs !== times[frame] ||
      value.confidence === null ||
      value.confidence < 0.9
    )
      throw Error(
        `Unsupported source evidence for ${objectId} at frame ${frame}.`,
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
    const first = measured[0].box,
      last = measured[2].box;
    if (
      Math.hypot(
        (first.left + first.right - last.left - last.right) / 2,
        (first.top + first.bottom - last.top - last.bottom) / 2,
      ) < 0.05
    )
      throw Error(
        "Unsupported transfer: source evidence does not show measurable displacement.",
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
  for (const [predicates, expectedFrame] of [
    [execution.initialConditions, firstFrame],
    [execution.finalConditions, lastFrame],
  ] as const)
    for (const predicate of predicates) {
      if (!predicate.evidenceFrames.includes(expectedFrame))
        throw Error(
          "Scene predicates require shared initial/final scene evidence, not unrelated moments.",
        );
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
