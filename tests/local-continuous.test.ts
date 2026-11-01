import { feedbackEvents } from "../src/practice/feedback";
import { expect, it } from "vitest";
import { demoProcedure } from "../src/procedure/demo";
import { ProcedureSpecSchema, type InputEvent } from "../src/procedure/schema";
import { createVerifier, verifyEvents } from "../src/procedure/verifier";

function procedure() {
  const value = structuredClone(demoProcedure);
  value.steps = [value.steps[0]];
  value.execution = {
    schemaVersion: 2,
    goal: "Place the object in its destination",
    goalStepIds: [value.steps[0].id],
    requirements: [
      {
        description: "Observed transfer",
        status: "covered",
        stepIds: [value.steps[0].id],
        reason: "Human reviewed transfer",
      },
    ],
  };
  value.steps[0].measurement = {
    method: "zone_transition",
    point: "center",
    maximumPositionDrift: 0.01,
    minimumFreshFrames: 3,
    stableForMs: 400,
    maxObservationGapMs: 600,
    persistence: "maintain",
    releaseStepId: null,
    reversalRecovery: "restore_target",
    forbiddenZoneIds: [],
    sourceFrames: { start: 0, change: 1, result: 2 },
  };
  return ProcedureSpecSchema.parse(value);
}
function observation(
  time: number,
  zone: string | null,
  quality: "observed" | "missing" = "observed",
): InputEvent {
  return {
    type: "observation",
    id: `event-${time}`,
    timestampMs: time,
    observation: {
      id: `observation-${time}`,
      objectId: "blue-base",
      timestampMs: time,
      quality,
      zone,
      spatialState:
        zone === null && quality === "observed" ? "transit" : "zone",
      confidence: quality === "observed" ? 0.99 : null,
      location: null,
      onsetMs: time,
      sourceObservedAtMs: 1,
      evidence: {
        sourceId: "synthetic-continuous-test",
        timestampMs: time,
        description: "Synthetic measured observation",
      },
    },
  };
}
it("retains a visible origin across a long continuous transfer without inventing a timeout", () => {
  const verifier = createVerifier(procedure());
  verifier.push(observation(1, "staging"));
  for (let t = 101; t < 15000; t += 100) verifier.push(observation(t, null));
  expect(verifier.push(observation(15001, "base-target")).steps[0].status).toBe(
    "passed",
  );
});
it("warns on measured reversal, preserves original pass and restores with fresh evidence", () => {
  const verifier = createVerifier(procedure());
  verifier.push(observation(1, "staging"));
  verifier.push(observation(500, "base-target"));
  const reversed = verifier.push(observation(1000, null));
  expect(reversed.steps[0].status).toBe("failed");
  expect(reversed.events.at(-1)?.decision).toBe("reversal");
  const restored = verifier.push(observation(1500, "base-target"));
  expect(restored.steps[0].status).toBe("passed");
  expect(restored.events.at(-1)?.decision).toBe("restoration");
  expect(restored.events.filter((e) => e.status === "passed")).toHaveLength(2);
});
it("missing identity is uncertainty and cannot turn target presence into a completed transfer", () => {
  const verifier = createVerifier(procedure());
  verifier.push(observation(1, "staging"));
  expect(verifier.push(observation(500, null, "missing")).steps[0].status).toBe(
    "needs_verification",
  );
  expect(
    verifier.push(observation(1000, "base-target")).steps[0].status,
  ).not.toBe("passed");
});

function twoSteps(repeat = false) {
  const value = procedure();
  const second = structuredClone(demoProcedure.steps[1]);
  second.measurement = structuredClone(value.steps[0].measurement);
  if (repeat) {
    second.condition.componentId = "blue-base";
    second.condition.fromZone = "base-target";
    value.steps[0].measurement!.persistence = "release_on_later_step";
    value.steps[0].measurement!.releaseStepId = second.id;
  }
  value.steps.push(second);
  value.execution!.goalStepIds = repeat
    ? [second.id]
    : value.steps.map((s) => s.id);
  return ProcedureSpecSchema.parse(value);
}
function nextObject(
  time: number,
  zone: string,
  onset: number,
  origin: number,
  pending: string[] = [],
): InputEvent {
  const event = observation(time, zone);
  if (event.type !== "observation") throw Error("Invalid test fixture");
  event.observation.objectId = "yellow-support";
  event.observation.onsetMs = onset;
  event.observation.sourceObservedAtMs = origin;
  event.observation.pendingPrerequisites = pending;
  return event;
}
it("uses physical occurrence time rather than confirmation time for continuous adjacent actions", () => {
  const verifier = createVerifier(twoSteps());
  verifier.push(observation(1, "staging"));
  verifier.push(nextObject(2, "staging", 2, 2));
  const first = observation(1000, "base-target");
  if (first.type !== "observation") throw Error("Invalid fixture");
  first.observation.onsetMs = 500;
  verifier.push(first);
  expect(
    verifier
      .push(nextObject(1100, "support-target", 700, 600))
      .steps.map((s) => s.status),
  ).toEqual(["passed", "passed"]);
});
it("retains a physically ordered transition while a slower prerequisite sensor finishes confirming", () => {
  const verifier = createVerifier(twoSteps());
  verifier.push(observation(1, "staging"));
  verifier.push(nextObject(2, "staging", 2, 2));
  expect(
    verifier.push(nextObject(900, "support-target", 700, 600, ["place-base"]))
      .steps[1].status,
  ).toBe("blocked");
  const first = observation(1000, "base-target");
  if (first.type !== "observation") throw Error("Invalid fixture");
  first.observation.onsetMs = 500;
  expect(verifier.push(first).steps.map((s) => s.status)).toEqual([
    "passed",
    "passed",
  ]);
});
it("permits an explicitly approved later transfer of the same object", () => {
  const verifier = createVerifier(twoSteps(true));
  verifier.push(observation(1, "staging"));
  verifier.push(observation(500, "base-target"));
  const next = observation(1000, "support-target");
  if (next.type !== "observation") throw Error("Invalid fixture");
  next.observation.sourceObservedAtMs = 500;
  expect(verifier.push(next).steps.map((s) => s.status)).toEqual([
    "passed",
    "passed",
  ]);
});
it("premature future movement fails instead of being retained without supporting evidence", () => {
  const verifier = createVerifier(twoSteps());
  verifier.push(nextObject(1, "staging", 1, 1));
  expect(
    verifier.push(nextObject(500, "support-target", 400, 1)).steps[1].status,
  ).toBe("failed");
});
it("does not confirm a retained transition after its object has left the destination", () => {
  const verifier = createVerifier(twoSteps());
  verifier.push(observation(1, "staging"));
  verifier.push(nextObject(2, "staging", 2, 2));
  verifier.push(nextObject(900, "support-target", 700, 600, ["place-base"]));
  verifier.push(nextObject(950, "staging", 950, 950));
  const first = observation(1000, "base-target");
  if (first.type !== "observation") throw Error("Invalid fixture");
  first.observation.onsetMs = 500;
  expect(verifier.push(first).steps[1].status).not.toBe("passed");
});
it("defers an approved wrong-order rule when the earlier physical event is still being confirmed", () => {
  const value = twoSteps();
  const step = value.steps[1];
  step.forbiddenTransitions = [
    {
      condition: step.condition,
      unlessVerified: ["place-base"],
      recovery: step.recovery,
    },
  ];
  const verifier = createVerifier(value);
  verifier.push(observation(1, "staging"));
  verifier.push(nextObject(2, "staging", 2, 2));
  expect(
    verifier.push(nextObject(900, "support-target", 700, 600, ["place-base"]))
      .steps[1].status,
  ).toBe("blocked");
  const first = observation(1000, "base-target");
  if (first.type !== "observation") throw Error("Invalid fixture");
  first.observation.onsetMs = 500;
  expect(verifier.push(first).steps.map((s) => s.status)).toEqual([
    "passed",
    "passed",
  ]);
});
it("keeps incremental and complete replay identical through partial visibility, revalidation, reversal and reset", () => {
  const p = procedure(),
    partial = observation(1000, null);
  if (partial.type !== "observation") throw Error("Invalid fixture");
  partial.observation.identityOnly = true;
  partial.observation.visibleFraction = 0.7;
  const events: InputEvent[] = [
    observation(1, "staging"),
    observation(500, "base-target"),
    partial,
    observation(1500, "base-target"),
    observation(2000, "staging"),
    observation(2500, "base-target"),
    { type: "reset", id: "reset", timestampMs: 3000 },
    observation(3500, "base-target"),
  ];
  const verifier = createVerifier(p);
  for (let i = 0; i < events.length; i++)
    expect(verifier.push(events[i])).toEqual(
      verifyEvents(p, events.slice(0, i + 1)),
    );
  expect(verifier.snapshot().steps[0].status).not.toBe("passed");
});
it("rejects contradictory forbidden origins and repeated-object measurement-point changes", () => {
  const p = procedure();
  p.steps[0].measurement!.forbiddenZoneIds = ["staging"];
  expect(() => ProcedureSpecSchema.parse(p)).toThrow("forbidden");
  const repeated = twoSteps(true);
  repeated.steps[1].measurement!.point = "bottom_center";
  expect(() => ProcedureSpecSchema.parse(repeated)).toThrow(
    "same measured point",
  );
});
it("keeps a known wrong-order correction active until recovery, including unrelated successes", () => {
  const verifier = createVerifier(twoSteps());
  verifier.push(nextObject(1, "staging", 1, 1));
  verifier.push(nextObject(500, "support-target", 500, 1));
  const waiting = verifier.push(nextObject(600, "support-target", 600, 1));
  expect(waiting.status).toBe("failed");
  expect(waiting.events.at(-1)?.status).toBe("ignored");
  verifier.push(observation(700, "staging"));
  const earlierPassed = verifier.push(observation(800, "base-target"));
  expect(
    feedbackEvents(earlierPassed, earlierPassed.events.slice(-1))[0].status,
  ).toBe("failed");
  verifier.push(nextObject(1000, "staging", 1000, 1000));
  const recovered = verifier.push(
    nextObject(1100, "support-target", 1100, 1000),
  );
  expect(recovered.status).toBe("passed");
  expect(feedbackEvents(recovered, recovered.events.slice(-1))[0].status).toBe(
    "passed",
  );
});
