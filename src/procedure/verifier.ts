import { z } from "zod";
import {
  InputEventSchema, ProcedureSpecSchema, VerificationResultSchema,
  type EvidenceReference, type Observation, type ProcedureSpec, type ProcedureStep,
  type VerificationEvent, type VerificationResult, type VisualCondition,
} from "./schema";

function clearObservation(observation: Observation, minimum: number): boolean {
  return observation.quality === "observed" && observation.zone !== null &&
    observation.confidence !== null && observation.confidence >= minimum;
}

function matches(condition: VisualCondition, before: Observation | undefined, after: Observation): boolean {
  return before !== undefined && before.objectId === condition.componentId &&
    after.objectId === condition.componentId &&
    clearObservation(before, condition.minimumConfidence) &&
    clearObservation(after, condition.minimumConfidence) &&
    before.zone === condition.fromZone && after.zone === condition.toZone &&
    before.timestampMs < after.timestampMs;
}

/**
 * Replay validated input from scratch. No clock, I/O, model, global state, or input mutation.
 * Replaying a log makes the audit trail the canonical state, rather than trusting a
 * caller-supplied "passed" flag. Invalid data throws ZodError; valid uncertainty is a result.
 */
export function verifyEvents(procedureInput: unknown, eventInput: unknown): VerificationResult {
  const procedure = ProcedureSpecSchema.parse(procedureInput);
  if (procedure.approval === null) throw new Error("Procedure requires explicit human approval before verification.");
  const inputs = z.array(InputEventSchema).max(10_000).parse(eventInput);
  const steps: VerificationResult["steps"] = procedure.steps.map((step) => ({
    stepId: step.id, status: "pending", verifiedAtMs: null,
  }));
  const events: VerificationEvent[] = [];
  const seenEvents = new Map<string, string>();
  const seenObservations = new Map<string, string>();
  const previous = new Map<string, Observation>();
  let lastTimestamp = -1;

  const refreshBlocked = () => {
    steps.forEach((state, index) => {
      if (state.status !== "pending" && state.status !== "blocked") return;
      state.status = steps.slice(0, index).some((s) => s.status !== "passed") ? "blocked" : "pending";
    });
  };
  const invalidateFrom = (index: number) => {
    for (let i = index; i < steps.length; i++) {
      if (steps[i].status === "passed") steps[i].status = "needs_verification";
      steps[i].verifiedAtMs = null;
      // Downstream transitions must be observed anew after prerequisite loss.
      previous.delete(procedure.steps[i].condition.componentId);
    }
  };
  refreshBlocked();

  for (const input of inputs) {
    const fingerprint = JSON.stringify(input);
    const old = seenEvents.get(input.id);
    const record = (
      status: VerificationEvent["status"], reason: string, step: ProcedureStep | null = null,
      missingPrerequisites: string[] = [], evidence: EvidenceReference[] = [],
      recovery = step?.recovery ?? null,
    ) => {
      events.push({ eventId: input.id, timestampMs: input.timestampMs,
        stepId: step?.id ?? null, status, reason, missingPrerequisites, evidence, recovery });
    };
    if (old !== undefined) {
      record(old === fingerprint ? "ignored" : "needs_verification",
        old === fingerprint ? "Duplicate event ignored." : "Conflicting event ID rejected.");
      continue;
    }
    seenEvents.set(input.id, fingerprint);
    if (input.type === "observation") {
      const priorFingerprint = seenObservations.get(input.observation.id);
      if (priorFingerprint !== undefined) {
        const identical = priorFingerprint === JSON.stringify(input.observation);
        record(identical ? "ignored" : "needs_verification",
          identical ? "Duplicate observation ignored." : "Conflicting observation ID rejected.");
        continue;
      }
    }
    if (input.timestampMs <= lastTimestamp) {
      record("needs_verification", "Events must have strictly increasing timestamps; stale or equal-time input rejected.");
      continue;
    }
    lastTimestamp = input.timestampMs;
    if (input.type === "reset") {
      steps.forEach((s) => { s.status = "pending"; s.verifiedAtMs = null; });
      previous.clear();
      refreshBlocked();
      record("reset", "Progress reset. New before/after evidence is required; duplicate protection is retained.");
      continue;
    }
    if (input.type === "retry") {
      const index = procedure.steps.findIndex((s) => s.id === input.stepId);
      if (index < 0) {
        record("needs_verification", "Unknown retry step.");
        continue;
      }
      invalidateFrom(index);
      steps.slice(index).forEach((s) => { s.status = "pending"; });
      refreshBlocked();
      record("retry", "Retry started. Progress from this step cleared; new transition evidence required.", procedure.steps[index]);
      continue;
    }

    const observation = input.observation;
    seenObservations.set(observation.id, JSON.stringify(observation));
    const index = procedure.steps.findIndex((s) => s.condition.componentId === observation.objectId);
    if (index < 0) {
      record("needs_verification", "Observation has an unknown object.", null, [], [observation.evidence]);
      continue;
    }
    const step = procedure.steps[index];
    const state = steps[index];
    if (observation.zone !== null && !procedure.zones.some((zone) => zone.id === observation.zone)) {
      invalidateFrom(index);
      state.status = "needs_verification";
      refreshBlocked();
      record("needs_verification", "Observation has an unknown zone; fresh evidence is required.", step, [], [observation.evidence]);
      continue;
    }
    const before = previous.get(observation.objectId);
    const evidence = before ? [before.evidence, observation.evidence] : [observation.evidence];
    const minimum = Math.max(step.condition.minimumConfidence, ...procedure.steps.flatMap((s) =>
      s.forbiddenTransitions.filter((r) => r.condition.componentId === observation.objectId)
        .map((r) => r.condition.minimumConfidence)));
    if (!clearObservation(observation, minimum)) {
      invalidateFrom(index);
      state.status = "needs_verification";
      previous.set(observation.objectId, observation);
      refreshBlocked();
      record("needs_verification", "Missing, unknown, obstructed, ambiguous, or low-confidence evidence.", step, [], evidence);
      continue;
    }
    if (state.status === "passed" && observation.zone !== step.condition.toZone) {
      invalidateFrom(index);
      state.status = "needs_verification";
      previous.set(observation.objectId, observation);
      refreshBlocked();
      record("needs_verification", "Previously verified target state was lost; this and later steps require fresh verification.", step, [], evidence);
      continue;
    }
    previous.set(observation.objectId, observation);
    const forbidden = findForbidden(procedure, before, observation, steps);
    if (forbidden) {
      steps[forbidden.index].status = "failed";
      invalidateFrom(forbidden.index);
      // Keep the observed closed state: another still-closed observation cannot count as recovery.
      previous.set(observation.objectId, observation);
      refreshBlocked();
      record("failed", "Forbidden transition: required earlier steps were not verified.",
        procedure.steps[forbidden.index], forbidden.missing, evidence, forbidden.recovery);
      continue;
    }
    if (!matches(step.condition, before, observation)) {
      if (state.status === "passed") {
        record("ignored", "Verified state unchanged; no new action inferred.", step, [], evidence);
      } else {
        if (state.status !== "failed") state.status = "needs_verification";
        record("needs_verification", "No clear before/after target-zone transition; object presence is insufficient.", step, [], evidence);
      }
      continue;
    }
    const required = new Set([...procedure.steps.slice(0, index).map((s) => s.id), ...step.prerequisites]);
    const missing = [...required].filter((id) => steps.find((s) => s.stepId === id)?.status !== "passed");
    if (missing.length) {
      state.status = "failed";
      invalidateFrom(index);
      previous.set(observation.objectId, observation);
      refreshBlocked();
      record("failed", "Wrong order: earlier steps must be verified before this transition.", step, missing, evidence);
      continue;
    }
    // A before/after interval spanning prerequisite verification cannot prove order.
    if (steps.slice(0, index).some((s) => s.verifiedAtMs !== null && s.verifiedAtMs > (before?.timestampMs ?? -1))) {
      state.status = "needs_verification";
      record("needs_verification", "Transition interval overlaps prerequisite verification; observe a fresh transition.", step, [], evidence);
      continue;
    }
    state.status = "passed";
    state.verifiedAtMs = observation.timestampMs;
    refreshBlocked();
    record("passed", "Observed target-zone transition with earlier steps verified.", step, [], evidence);
  }
  const last = events.findLast((event) => event.status !== "ignored");
  const status: VerificationResult["status"] = steps.some((s) => s.status === "failed") ? "failed" :
    last?.status === "needs_verification" || steps.some((s) => s.status === "needs_verification") ? "needs_verification" :
    steps.every((s) => s.status === "passed") ? "passed" :
    steps.some((s) => s.status === "passed") ? "in_progress" : "pending";
  return VerificationResultSchema.parse({ procedureId: procedure.id, procedureVersion: procedure.version, status, steps, events });
}

function findForbidden(
  procedure: ProcedureSpec, before: Observation | undefined, after: Observation,
  states: VerificationResult["steps"],
) {
  for (const [index, step] of procedure.steps.entries()) {
    for (const rule of step.forbiddenTransitions) {
      const missing = rule.unlessVerified.filter((id) => states.find((s) => s.stepId === id)?.status !== "passed");
      if (missing.length && matches(rule.condition, before, after)) return { index, missing, recovery: rule.recovery };
    }
  }
  return null;
}
