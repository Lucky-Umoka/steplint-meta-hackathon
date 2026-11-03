import type { TeachDraft } from "./schema";

/**
 * Derive the two V3 object fields that the procedure contract fully determines
 * from other explicit model output, instead of asking the model to restate them
 * consistently:
 *
 * - `role: "required"` holds exactly when an explicit step or scene predicate
 *   measures the object (the validator requires both directions). The model's
 *   supporting/irrelevant choice is kept for unreferenced objects; an
 *   unreferenced object the model called required becomes supporting, so it
 *   keeps its identity references but cannot gate Practice.
 * - `firstRequiredAt` is `initial` when an initial predicate measures the
 *   object, otherwise the first step that requires it, and `never` for
 *   non-required objects. An object measured only by final predicates keeps the
 *   model's value, which the validator still checks.
 *
 * Steps, windows, predicates, requirements and goals are never created,
 * removed or reinterpreted here. Every override is written into the object's
 * roleReason so the human reviewer sees it.
 */
export function deriveV3Relevance(draft: TeachDraft): TeachDraft {
  const execution = draft.procedure.execution;
  if (execution?.schemaVersion !== 3) return draft;
  const next = structuredClone(draft);
  const { steps, components } = next.procedure;
  const predicates = [
    ...execution.initialConditions,
    ...execution.finalConditions,
  ];
  const measuredBy = (
    predicate: (typeof predicates)[number],
    objectId: string,
  ) =>
    predicate.objectId === objectId ||
    (predicate.kind === "projected_separation" &&
      predicate.otherObjectId === objectId);
  for (const component of components) {
    const current = component.execution;
    if (!current) continue;
    const firstStep = steps.find(
      (step) =>
        step.condition.componentId === component.id ||
        step.execution?.requiredObjectIds.includes(component.id),
    );
    const inInitial = execution.initialConditions.some((p) =>
      measuredBy(p, component.id),
    );
    const required =
      !!firstStep || predicates.some((p) => measuredBy(p, component.id));
    const role = required
      ? "required"
      : current.role === "required"
        ? "supporting"
        : current.role;
    const firstRequiredAt = !required
      ? "never"
      : inInitial
        ? "initial"
        : firstStep
          ? { stepId: firstStep.id }
          : current.firstRequiredAt;
    const changes: string[] = [];
    if (role !== current.role)
      changes.push(
        required
          ? `role required (model said ${current.role}) because ${firstStep ? firstStep.id : "a scene predicate"} measures it`
          : `role supporting (model said required) because no step or scene predicate measures it`,
      );
    if (JSON.stringify(firstRequiredAt) !== JSON.stringify(current.firstRequiredAt))
      changes.push(
        `activation ${typeof firstRequiredAt === "string" ? firstRequiredAt : firstRequiredAt.stepId} (model said ${typeof current.firstRequiredAt === "string" ? current.firstRequiredAt : current.firstRequiredAt.stepId})`,
      );
    if (!changes.length) continue;
    const prefix = `Compiler-derived: ${changes.join("; ")}. Review this. `;
    component.execution = {
      ...current,
      role,
      firstRequiredAt,
      roleReason: (prefix + current.roleReason).slice(0, 2000),
    };
  }
  return next;
}
