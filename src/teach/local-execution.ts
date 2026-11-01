import type { TeachDraft, TeachContext } from "./schema";
/** Explicit draft extension, never approval or a conversion of a signed artifact. */
export function localExecutionDraft(
  draft: TeachDraft,
  goal: string,
  context?: TeachContext,
): TeachDraft {
  if (draft.procedure.approval)
    throw Error("Approved content cannot be silently converted.");
  const next = structuredClone(draft);
  if (context)
    for (const selection of context.selections)
      if (!next.procedure.components.some((c) => c.id === selection.id))
        next.procedure.components.push({
          id: selection.id,
          description: selection.description,
        });
  const steps = next.procedure.steps;
  next.procedure.execution = {
    schemaVersion: 2,
    goal,
    goalStepIds: steps
      .filter(
        (step, i) =>
          !steps
            .slice(i + 1)
            .some(
              (later) =>
                later.condition.componentId === step.condition.componentId,
            ),
      )
      .map((step) => step.id),
    requirements: [
      {
        description: goal,
        status: "unsupported",
        stepIds: [],
        reason: "Creator must confirm which measured steps cover this goal.",
      },
    ],
  };
  steps.forEach((step, i) => {
    const later = steps
      .slice(i + 1)
      .find(
        (s) =>
          s.condition.componentId === step.condition.componentId &&
          s.condition.fromZone === step.condition.toZone,
      );
    step.measurement = {
      method: "zone_transition",
      point: "center",
      maximumPositionDrift: 0.01,
      minimumFreshFrames: 3,
      stableForMs: 400,
      maxObservationGapMs: 600,
      persistence: later ? "release_on_later_step" : "maintain",
      releaseStepId: later?.id ?? null,
      reversalRecovery: "restore_target",
      forbiddenZoneIds: [],
    };
  });
  return next;
}
