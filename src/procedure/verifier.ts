import { z } from "zod";
import {
  InputEventSchema,
  ProcedureSpecSchema,
  VerificationResultSchema,
  type EvidenceReference,
  type Observation,
  type ProcedureSpec,
  type ProcedureStep,
  type VerificationEvent,
  type VerificationResult,
  type VisualCondition,
} from "./schema";

function clearObservation(observation: Observation, minimum: number): boolean {
  return (
    observation.quality === "observed" &&
    observation.zone !== null &&
    observation.confidence !== null &&
    observation.confidence >= minimum
  );
}

/**
 * Bounded occlusion bridge (owner physical-camera report, 2026-11-04): a
 * learner's hand hides the object while carrying it. When the last CLEAR
 * observation of the object was at the step's start zone, nothing clear
 * was observed anywhere else since, and the object is now clearly measured
 * at the target within this bound, the two measured endpoints are the
 * before/after evidence. Nothing is inferred across the unseen interval
 * except that the same tracked identity changed zones; identity
 * reacquisition gates are unchanged and no threshold is lowered.
 */
export const OCCLUSION_BRIDGE_MS = 12_000;

function matches(
  condition: VisualCondition,
  before: Observation | undefined,
  after: Observation,
): boolean {
  return (
    before !== undefined &&
    before.objectId === condition.componentId &&
    after.objectId === condition.componentId &&
    clearObservation(before, condition.minimumConfidence) &&
    clearObservation(after, condition.minimumConfidence) &&
    before.zone === condition.fromZone &&
    after.zone === condition.toZone &&
    before.timestampMs < after.timestampMs
  );
}

/**
 * Replay validated input from scratch. No clock, I/O, model, global state, or input mutation.
 * Replaying a log makes the audit trail the canonical state, rather than trusting a
 * caller-supplied "passed" flag. Invalid data throws ZodError; valid uncertainty is a result.
 */
export function createVerifier(procedureInput: unknown) {
  const procedure = ProcedureSpecSchema.parse(procedureInput);
  if (procedure.approval === null)
    throw new Error(
      "Procedure requires explicit human approval before verification.",
    );
  const steps: VerificationResult["steps"] = procedure.steps.map((step) => ({
    stepId: step.id,
    status: "pending",
    verifiedAtMs: null,
  }));
  const events: VerificationEvent[] = [];
  const seenEvents = new Map<string, string>();
  const seenObservations = new Map<string, string>();
  const previous = new Map<string, Observation>();
  /** Last clear (zone-measured) observation per object, for the bridge. */
  const lastClear = new Map<string, Observation>();
  let lastTimestamp = -1;
  let consumed = 0;
  const reversed = new Set<number>();
  const released = new Set<number>();
  const revalidate = new Set<number>();
  const physicalCompletion = new Map<number, number>();
  const pendingTransitions = new Map<number, Observation>();
  let lastSignificant: VerificationEvent | null = null;

  const refreshBlocked = () => {
    steps.forEach((state, index) => {
      if (state.status !== "pending" && state.status !== "blocked") return;
      state.status = steps.slice(0, index).some((s) => s.status !== "passed")
        ? "blocked"
        : "pending";
    });
  };
  const invalidateFrom = (index: number, ownVisibilityOnly = false) => {
    for (let i = index; i < steps.length; i++) {
      if (steps[i].status === "passed") {
        if (procedure.execution) revalidate.add(i);
        steps[i].status = "needs_verification";
      }
      steps[i].verifiedAtMs = null;
      // Downstream transitions must be observed anew after prerequisite loss.
      previous.delete(procedure.steps[i].condition.componentId);
      // The object's own loss of view keeps its last clear origin for the
      // bounded bridge; any other invalidation needs a fresh start.
      const component = procedure.steps[i].condition.componentId;
      if (
        !ownVisibilityOnly ||
        component !== procedure.steps[index].condition.componentId
      )
        lastClear.delete(component);
      pendingTransitions.delete(i);
      released.delete(i);
    }
  };
  refreshBlocked();

  function push(inputValue: unknown): VerificationResult {
    if (++consumed > 10_000)
      throw new Error("Verification event limit reached.");
    for (const input of [InputEventSchema.parse(inputValue)]) {
      const fingerprint = JSON.stringify(input);
      const old = seenEvents.get(input.id);
      const record = (
        status: VerificationEvent["status"],
        reason: string,
        step: ProcedureStep | null = null,
        missingPrerequisites: string[] = [],
        evidence: EvidenceReference[] = [],
        recovery = step?.recovery ?? null,
        decision?: VerificationEvent["decision"],
      ) => {
        const event: VerificationEvent = {
          eventId: input.id,
          timestampMs: input.timestampMs,
          stepId: step?.id ?? null,
          status,
          reason,
          missingPrerequisites,
          evidence,
          recovery,
          ...(decision ? { decision } : {}),
          ...(procedure.execution && input.type === "observation"
            ? { observedAtMs: input.observation.onsetMs ?? input.timestampMs }
            : {}),
        };
        freezeEvidence(event);
        events.push(event);
        if (status !== "ignored") lastSignificant = event;
      };
      if (old !== undefined) {
        record(
          old === fingerprint ? "ignored" : "needs_verification",
          old === fingerprint
            ? "Duplicate event ignored."
            : "Conflicting event ID rejected.",
        );
        continue;
      }
      seenEvents.set(input.id, fingerprint);
      if (input.type === "observation") {
        const priorFingerprint = seenObservations.get(input.observation.id);
        if (priorFingerprint !== undefined) {
          const identical =
            priorFingerprint === JSON.stringify(input.observation);
          record(
            identical ? "ignored" : "needs_verification",
            identical
              ? "Duplicate observation ignored."
              : "Conflicting observation ID rejected.",
          );
          continue;
        }
      }
      if (input.timestampMs <= lastTimestamp) {
        record(
          "needs_verification",
          "Events must have strictly increasing timestamps; stale or equal-time input rejected.",
        );
        continue;
      }
      lastTimestamp = input.timestampMs;
      if (input.type === "reset") {
        steps.forEach((s) => {
          s.status = "pending";
          s.verifiedAtMs = null;
        });
        previous.clear();
        lastClear.clear();
        reversed.clear();
        released.clear();
        revalidate.clear();
        physicalCompletion.clear();
        pendingTransitions.clear();
        refreshBlocked();
        record(
          "reset",
          "Progress reset. New before/after evidence is required; duplicate protection is retained.",
        );
        continue;
      }
      if (input.type === "retry") {
        const index = procedure.steps.findIndex((s) => s.id === input.stepId);
        if (index < 0) {
          record("needs_verification", "Unknown retry step.");
          continue;
        }
        invalidateFrom(index);
        steps.slice(index).forEach((s, offset) => {
          s.status = "pending";
          revalidate.delete(index + offset);
          physicalCompletion.delete(index + offset);
          reversed.delete(index + offset);
        });
        refreshBlocked();
        record(
          "retry",
          "Retry started. Progress from this step cleared; new transition evidence required.",
          procedure.steps[index],
        );
        continue;
      }

      const observation = input.observation;
      seenObservations.set(observation.id, JSON.stringify(observation));
      const matching = procedure.steps
        .map((step, index) => ({ step, index }))
        .filter(
          ({ step }) => step.condition.componentId === observation.objectId,
        );
      let index = procedure.execution
        ? ((
            matching.find(({ index }) => steps[index].status !== "passed") ??
            matching.at(-1)
          )?.index ?? -1)
        : (matching[0]?.index ?? -1);
      if (procedure.execution) {
        for (const candidate of matching) {
          if (
            steps[candidate.index].status !== "passed" ||
            released.has(candidate.index)
          )
            continue;
          if (observation.zone === candidate.step.condition.toZone) continue;
          const releaseIndex = procedure.steps.findIndex(
            (s) => s.id === candidate.step.measurement?.releaseStepId,
          );
          const mayRelease =
            observation.quality === "observed" &&
            observation.confidence !== null &&
            observation.confidence >=
              candidate.step.condition.minimumConfidence &&
            candidate.step.measurement?.persistence ===
              "release_on_later_step" &&
            releaseIndex > candidate.index &&
            steps.slice(0, releaseIndex).every((s) => s.status === "passed");
          if (mayRelease) released.add(candidate.index);
          else {
            index = candidate.index;
            break;
          }
        }
      }
      if (index < 0) {
        record(
          "needs_verification",
          "Observation has an unknown object.",
          null,
          [],
          [observation.evidence],
        );
        continue;
      }
      const step = procedure.steps[index];
      const state = steps[index];
      if (
        observation.zone !== null &&
        !procedure.zones.some((zone) => zone.id === observation.zone)
      ) {
        invalidateFrom(index);
        state.status = "needs_verification";
        refreshBlocked();
        record(
          "needs_verification",
          "Observation has an unknown zone; fresh evidence is required.",
          step,
          [],
          [observation.evidence],
        );
        continue;
      }
      if (
        pendingTransitions.has(index) &&
        observation.zone !== step.condition.toZone
      )
        pendingTransitions.delete(index);
      const minimum = Math.max(
        step.condition.minimumConfidence,
        ...procedure.steps.flatMap((s) =>
          s.forbiddenTransitions
            .filter((r) => r.condition.componentId === observation.objectId)
            .map((r) => r.condition.minimumConfidence),
        ),
      );
      const immediate = previous.get(observation.objectId);
      const origin = lastClear.get(observation.objectId);
      // Bridge only from an unclear immediate predecessor to a clear,
      // geometry-measured current observation (see OCCLUSION_BRIDGE_MS).
      const bridged =
        !!procedure.execution &&
        !!immediate &&
        !clearObservation(immediate, minimum) &&
        clearObservation(observation, minimum) &&
        !observation.identityOnly &&
        !!origin &&
        origin.zone !== observation.zone &&
        observation.timestampMs - origin.timestampMs <= OCCLUSION_BRIDGE_MS
          ? origin
          : undefined;
      const before = bridged ?? immediate;
      if (clearObservation(observation, minimum) && !observation.identityOnly)
        lastClear.set(observation.objectId, observation);
      const evidence = before
        ? [before.evidence, observation.evidence]
        : [observation.evidence];
      const clearIdentity =
        observation.quality === "observed" &&
        observation.confidence !== null &&
        observation.confidence >= minimum;
      const inTransit =
        !!procedure.execution &&
        clearIdentity &&
        observation.spatialState === "transit";
      if (
        procedure.execution &&
        observation.identityOnly &&
        state.status === "passed"
      ) {
        invalidateFrom(index);
        state.status = "needs_verification";
        refreshBlocked();
        record(
          "needs_verification",
          "Identity remains visible but endpoint geometry is obstructed; no reversal inferred.",
          step,
          [],
          evidence,
        );
        continue;
      }
      if (!clearObservation(observation, minimum) && !inTransit) {
        invalidateFrom(index, true);
        state.status = "needs_verification";
        previous.set(observation.objectId, observation);
        refreshBlocked();
        record(
          "needs_verification",
          "Missing, unknown, obstructed, ambiguous, or low-confidence evidence.",
          step,
          [],
          evidence,
        );
        continue;
      }
      if (
        procedure.execution &&
        revalidate.has(index) &&
        !reversed.has(index) &&
        observation.zone === step.condition.toZone &&
        !observation.identityOnly &&
        steps.slice(0, index).every((s) => s.status === "passed")
      ) {
        state.status = "passed";
        state.verifiedAtMs =
          physicalCompletion.get(index) ??
          observation.onsetMs ??
          observation.timestampMs;
        revalidate.delete(index);
        previous.set(observation.objectId, observation);
        refreshBlocked();
        record(
          "passed",
          "Previously verified action retained; required state is clear again from fresh evidence.",
          step,
          [],
          evidence,
          null,
          "restoration",
        );
        continue;
      }
      if (
        (state.status === "passed" ||
          (procedure.execution &&
            revalidate.has(index) &&
            step.measurement?.persistence === "maintain")) &&
        !observation.identityOnly &&
        observation.zone !== step.condition.toZone
      ) {
        invalidateFrom(index);
        state.status = procedure.execution ? "failed" : "needs_verification";
        if (procedure.execution) reversed.add(index);
        previous.set(observation.objectId, observation);
        refreshBlocked();
        record(
          procedure.execution ? "failed" : "needs_verification",
          "Previously verified target state was lost; this and later steps require fresh verification.",
          step,
          [],
          evidence,
          step.recovery,
          procedure.execution ? "reversal" : undefined,
        );
        continue;
      }
      if (
        procedure.execution &&
        reversed.has(index) &&
        step.measurement?.reversalRecovery === "restore_target" &&
        observation.zone === step.condition.toZone
      ) {
        const missing = procedure.steps
          .slice(0, index)
          .filter(
            (s) => steps.find((x) => x.stepId === s.id)?.status !== "passed",
          )
          .map((s) => s.id);
        if (!missing.length) {
          state.status = "passed";
          state.verifiedAtMs =
            physicalCompletion.get(index) ??
            observation.onsetMs ??
            observation.timestampMs;
          revalidate.delete(index);
          reversed.delete(index);
          previous.set(observation.objectId, observation);
          refreshBlocked();
          record(
            "passed",
            "Required verified state restored from fresh evidence.",
            step,
            [],
            evidence,
            null,
            "restoration",
          );
          continue;
        }
      }
      if (
        procedure.execution &&
        step.measurement?.forbiddenZoneIds.includes(observation.zone ?? "")
      ) {
        invalidateFrom(index);
        state.status = "failed";
        previous.set(observation.objectId, observation);
        refreshBlocked();
        record(
          "failed",
          "Entered an approved forbidden destination.",
          step,
          [],
          evidence,
        );
        continue;
      }
      if (inTransit) {
        record(
          "ignored",
          "Continuous visible travel; no completed action inferred.",
          step,
          [],
          evidence,
        );
        continue;
      }
      previous.set(observation.objectId, observation);
      const forbidden = findForbidden(procedure, before, observation, steps);
      if (
        forbidden &&
        !(
          procedure.execution &&
          forbidden.missing.every((id) =>
            observation.pendingPrerequisites?.includes(id),
          )
        )
      ) {
        steps[forbidden.index].status = "failed";
        invalidateFrom(forbidden.index);
        // Keep the observed closed state: another still-closed observation cannot count as recovery.
        previous.set(observation.objectId, observation);
        refreshBlocked();
        record(
          "failed",
          "Forbidden transition: required earlier steps were not verified.",
          procedure.steps[forbidden.index],
          forbidden.missing,
          evidence,
          forbidden.recovery,
        );
        continue;
      }
      if (!matches(step.condition, before, observation)) {
        if (procedure.execution && state.status === "failed") {
          record(
            "ignored",
            "The known violation remains unresolved; observe the approved recovery.",
            step,
            [],
            evidence,
          );
          continue;
        }
        if (
          procedure.execution &&
          observation.zone === step.condition.fromZone &&
          state.status !== "passed"
        ) {
          if (state.status !== "failed") state.status = "pending";
          refreshBlocked();
          record(
            "ignored",
            "Clear starting state observed; waiting for the actual transition.",
            step,
            [],
            evidence,
          );
          continue;
        }
        if (state.status === "passed") {
          record(
            "ignored",
            "Verified state unchanged; no new action inferred.",
            step,
            [],
            evidence,
          );
        } else {
          if (state.status !== "failed") state.status = "needs_verification";
          record(
            "needs_verification",
            "No clear before/after target-zone transition; object presence is insufficient.",
            step,
            [],
            evidence,
          );
        }
        continue;
      }
      const required = new Set([
        ...procedure.steps.slice(0, index).map((s) => s.id),
        ...step.prerequisites,
      ]);
      const missing = [...required].filter(
        (id) => steps.find((s) => s.stepId === id)?.status !== "passed",
      );
      if (
        missing.length &&
        procedure.execution &&
        missing.every((id) => observation.pendingPrerequisites?.includes(id))
      ) {
        pendingTransitions.set(index, observation);
        state.status = "blocked";
        record(
          "needs_verification",
          "Earlier physical condition is still being confirmed; transition retained.",
          step,
          missing,
          evidence,
        );
        continue;
      }
      if (missing.length) {
        state.status = "failed";
        invalidateFrom(index);
        previous.set(observation.objectId, observation);
        refreshBlocked();
        record(
          "failed",
          "Wrong order: earlier steps must be verified before this transition.",
          step,
          missing,
          evidence,
        );
        continue;
      }
      // A before/after interval spanning prerequisite verification cannot prove order.
      if (
        steps
          .slice(0, index)
          .some(
            (s) =>
              s.verifiedAtMs !== null &&
              s.verifiedAtMs >
                (procedure.execution
                  ? (observation.sourceObservedAtMs ??
                    before?.timestampMs ??
                    -1)
                  : (before?.timestampMs ?? -1)),
          )
      ) {
        state.status = "needs_verification";
        record(
          "needs_verification",
          "Transition interval overlaps prerequisite verification; observe a fresh transition.",
          step,
          [],
          evidence,
        );
        continue;
      }
      state.status = "passed";
      state.verifiedAtMs = procedure.execution
        ? (observation.onsetMs ?? observation.timestampMs)
        : observation.timestampMs;
      physicalCompletion.set(index, state.verifiedAtMs);
      revalidate.delete(index);
      reversed.delete(index);
      released.delete(index);
      refreshBlocked();
      record(
        "passed",
        bridged
          ? "Observed target-zone transition with earlier steps verified (start and target clearly measured; brief occlusion between them)."
          : "Observed target-zone transition with earlier steps verified.",
        step,
        [],
        evidence,
      );
      for (const [pendingIndex, candidate] of pendingTransitions) {
        const prior = steps.slice(0, pendingIndex);
        if (prior.some((state) => state.status !== "passed")) continue;
        if (
          prior.some(
            (state) =>
              state.verifiedAtMs! > (candidate.sourceObservedAtMs ?? -1),
          )
        ) {
          pendingTransitions.delete(pendingIndex);
          continue;
        }
        const pendingStep = procedure.steps[pendingIndex];
        steps[pendingIndex].status = "passed";
        steps[pendingIndex].verifiedAtMs =
          candidate.onsetMs ?? candidate.timestampMs;
        physicalCompletion.set(pendingIndex, steps[pendingIndex].verifiedAtMs!);
        revalidate.delete(pendingIndex);
        reversed.delete(pendingIndex);
        released.delete(pendingIndex);
        const deferred: VerificationEvent = {
          eventId: `confirmed-${candidate.id}`,
          timestampMs: input.timestampMs,
          observedAtMs: candidate.onsetMs ?? candidate.timestampMs,
          stepId: pendingStep.id,
          status: "passed",
          reason:
            "Retained continuous transition confirmed after its physical prerequisite.",
          missingPrerequisites: [],
          evidence: [candidate.evidence],
          recovery: null,
          decision: "transition",
        };
        freezeEvidence(deferred);
        events.push(deferred);
        lastSignificant = deferred;
        pendingTransitions.delete(pendingIndex);
        refreshBlocked();
      }
    }
    return snapshot();
  }
  function snapshot(): VerificationResult {
    const last = lastSignificant;
    const status: VerificationResult["status"] = steps.some(
      (s) => s.status === "failed",
    )
      ? "failed"
      : (last?.status === "needs_verification" &&
            (!procedure.execution ||
              !last.stepId ||
              steps.find((s) => s.stepId === last.stepId)?.status ===
                "needs_verification")) ||
          steps.some((s) => s.status === "needs_verification")
        ? "needs_verification"
        : steps.every((s) => s.status === "passed")
          ? "passed"
          : steps.some((s) => s.status === "passed")
            ? "in_progress"
            : "pending";
    return {
      procedureId: procedure.id,
      procedureVersion: procedure.version,
      status,
      steps: steps.map((step) => ({ ...step })),
      events: [...events],
    };
  }
  function expectedResumeZones() {
    const components = [
      ...new Set(procedure.steps.map((step) => step.condition.componentId)),
    ];
    return Object.fromEntries(
      components.map((component) => {
        const related = procedure.steps
          .map((step, index) => ({ step, index }))
          .filter(({ step }) => step.condition.componentId === component);
        const current =
          related.find(({ index }) => steps[index].status !== "passed") ??
          related.at(-1)!;
        const restored =
          physicalCompletion.has(current.index) &&
          (!reversed.has(current.index) ||
            current.step.measurement?.reversalRecovery === "restore_target");
        return [
          component,
          steps[current.index].status === "passed" || restored
            ? current.step.condition.toZone
            : current.step.condition.fromZone,
        ];
      }),
    );
  }
  return { push, snapshot, expectedResumeZones };
}

/** Replay uses the exact same reducer as incremental camera verification. */
export function verifyEvents(
  procedureInput: unknown,
  eventInput: unknown,
): VerificationResult {
  const inputs = z.array(InputEventSchema).max(10_000).parse(eventInput);
  const verifier = createVerifier(procedureInput);
  for (const input of inputs) verifier.push(input);
  return VerificationResultSchema.parse(verifier.snapshot());
}
function freezeEvidence(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeEvidence);
    Object.freeze(value);
  }
}

function findForbidden(
  procedure: ProcedureSpec,
  before: Observation | undefined,
  after: Observation,
  states: VerificationResult["steps"],
) {
  for (const [index, step] of procedure.steps.entries()) {
    for (const rule of step.forbiddenTransitions) {
      const missing = rule.unlessVerified.filter(
        (id) => states.find((s) => s.stepId === id)?.status !== "passed",
      );
      if (missing.length && matches(rule.condition, before, after))
        return { index, missing, recovery: rule.recovery };
    }
  }
  return null;
}
