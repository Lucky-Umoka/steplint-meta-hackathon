import type { ProcedureSpec, VerificationResult } from "../procedure/schema";

export type WatchSet = {
  /** Changes whenever membership changes; replies for another key are stale. */
  key: string;
  /** Active required identities: each must be reported every frame (observed or explicitly unknown). */
  required: string[];
  /** Supporting identities: may assist localization, never block verification. */
  optional: string[];
  /** Required identities whose approved activation step has not been reached. */
  dormant: string[];
};

/**
 * Role-aware runtime watch set from the approved procedure and the verifier's
 * current state. For V3 lessons every *activated* required object is watched,
 * not only the current mover: that covers the current and next steps, objects
 * whose premature (wrong-order) movement must be detected, verified persistent
 * conditions and final-goal objects. A required object is activated when its
 * approved `firstRequiredAt` is `initial`, or when its activation step is the
 * current step or already behind it. Supporting objects are optional and
 * irrelevant objects are never watched. Older (V2) lessons without roles keep
 * their existing contract: every approved object is required.
 */
export function watchSet(
  procedure: ProcedureSpec,
  result: Pick<VerificationResult, "steps">,
): WatchSet {
  const v3 = procedure.execution?.schemaVersion === 3;
  if (!v3) {
    const required = procedure.components.map((c) => c.id);
    return {
      key: `all|${required.join(",")}`,
      required,
      optional: [],
      dormant: [],
    };
  }
  const passed = (id: string) =>
    result.steps.find((state) => state.stepId === id)?.status === "passed";
  const firstOpen = procedure.steps.findIndex((step) => !passed(step.id));
  const current = firstOpen < 0 ? procedure.steps.length : firstOpen;
  const required: string[] = [],
    optional: string[] = [],
    dormant: string[] = [];
  for (const component of procedure.components) {
    const execution = component.execution;
    const role = execution?.role ?? "required";
    if (role === "irrelevant") continue;
    if (role === "supporting") {
      optional.push(component.id);
      continue;
    }
    const activation = execution?.firstRequiredAt ?? "initial";
    const activationIndex =
      activation === "initial"
        ? 0
        : activation === "never"
          ? Infinity
          : procedure.steps.findIndex((step) => step.id === activation.stepId);
    if (activationIndex < 0)
      throw Error(`Unknown activation step for ${component.id}.`);
    (activationIndex <= current ? required : dormant).push(component.id);
  }
  return {
    key: `v3|${current}|${required.join(",")}|${optional.join(",")}`,
    required,
    optional,
    dormant,
  };
}
