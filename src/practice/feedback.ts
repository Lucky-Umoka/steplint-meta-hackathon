import type {
  VerificationEvent,
  VerificationResult,
} from "../procedure/schema";
/** Presentation priority only: an unresolved verified violation cannot be
 * replaced by an unrelated success or an advisory. Verdicts remain verifier-owned. */
export function feedbackEvents(
  result: VerificationResult,
  fresh: VerificationEvent[],
): VerificationEvent[] {
  const failed = result.steps.find((step) => step.status === "failed");
  if (failed) {
    const event = result.events.findLast(
      (event) => event.stepId === failed.stepId && event.status === "failed",
    );
    return event ? [event] : [];
  }
  return fresh.filter((event) => event.status !== "ignored");
}
