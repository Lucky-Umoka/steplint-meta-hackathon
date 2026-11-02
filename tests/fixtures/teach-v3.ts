import type { TeachDraft } from "../../src/teach/schema";
import type { ExecutionV3 } from "../../src/procedure/execution-v3";
import { localFixture } from "./local-procedure";

export function teachV3Fixture(twoActions = false) {
  const { context, draft } = localFixture();
  const last = twoActions ? 4 : 2;
  context.lesson.media.frameTimesMs = Array.from(
    { length: last + 1 },
    (_, frame) => frame * 100,
  );
  context.tracking[0].samples = Array.from(
    { length: last + 1 },
    (_, frame) => ({
      frame,
      timestampMs: frame * 100,
      confidence: 0.99,
      maskPixels: 100,
      box: {
        left: 0.1 + frame * 0.15,
        top: 0.3,
        right: 0.25 + frame * 0.15,
        bottom: 0.65,
      },
    }),
  );
  draft.procedure.components[0].execution = {
    role: "required",
    roleReason: "Object whose transfer proves the task",
    motion: "movable",
    firstRequiredAt: "initial",
    referenceFrames: [0, last],
  };
  draft.procedure.steps[0].execution = {
    requiredObjectIds: ["component-1"],
    capability: "zone_transition",
    supportedClaim: "The visible object moves between the reviewed zones",
    evidenceWindow: { startFrame: 0, changeFrame: 1, resultFrame: 2 },
  };
  if (twoActions) {
    draft.procedure.zones.push({
      id: "middle",
      description: "Intermediate destination",
    });
    draft.procedure.steps[0].condition.toZone = "middle";
    const second = structuredClone(draft.procedure.steps[0]);
    second.id = "transfer-again";
    second.prerequisites = ["transfer"];
    second.condition = {
      ...second.condition,
      fromZone: "middle",
      toZone: "destination",
    };
    second.execution!.evidenceWindow = {
      startFrame: 2,
      changeFrame: 3,
      resultFrame: 4,
    };
    draft.procedure.steps.push(second);
    draft.notes.push({
      ...structuredClone(draft.notes[0]),
      stepId: second.id,
      supportingFrames: [2, 3, 4],
    });
  }
  const execution: ExecutionV3 = {
    schemaVersion: 3,
    goal: "Transfer the visible object to the destination",
    goalStepIds: [draft.procedure.steps.at(-1)!.id],
    requirements: [
      {
        id: "requirement-1",
        description: "Visible object reaches its destination",
        status: "covered",
        capability: "zone_transition",
        stepIds: draft.procedure.steps.map((s) => s.id),
        goalPredicateIds: ["goal-position"],
        reason: "Source action evidence and final scene",
      },
    ],
    initialConditions: [
      {
        id: "initial-position",
        kind: "object_in_zone",
        objectId: "component-1",
        zoneId: "origin",
        evidenceFrames: [0],
      },
    ],
    finalConditions: [
      {
        id: "goal-position",
        kind: "object_in_zone",
        objectId: "component-1",
        zoneId: "destination",
        evidenceFrames: [last],
      },
    ],
  };
  draft.procedure.execution = execution;
  return { context, draft: draft as TeachDraft, execution };
}
