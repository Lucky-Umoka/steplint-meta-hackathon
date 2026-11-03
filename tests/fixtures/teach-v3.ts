import type { TeachDraft } from "../../src/teach/schema";
import type { ExecutionV3 } from "../../src/procedure/execution-v3";
import { localFixture } from "./local-procedure";

/**
 * Realistic V3 source timeline (100 ms per frame): the object is still for
 * 400 ms before each move and after it lands, as Teach requires for an
 * at-rest start and result. FRAMES names every landmark tests use.
 */
export function v3Frames(twoActions = false) {
  return twoActions
    ? {
        first: { startFrame: 4, changeFrame: 5, resultFrame: 6 },
        second: { startFrame: 10, changeFrame: 11, resultFrame: 12 },
        last: 16,
      }
    : {
        first: { startFrame: 4, changeFrame: 5, resultFrame: 6 },
        second: null,
        last: 10,
      };
}
export function teachV3Fixture(twoActions = false) {
  const { context, draft } = localFixture();
  const frames = v3Frames(twoActions);
  const last = frames.last;
  // Pose per frame: still at origin, one moving frame, still where it lands.
  const left = (frame: number) =>
    frame <= 4 ? 0.1 : frame === 5 ? 0.25 : frame <= 10 ? 0.4 : frame === 11 ? 0.55 : 0.7;
  context.lesson.media.frameTimesMs = Array.from(
    { length: last + 1 },
    (_, frame) => frame * 100,
  );
  context.lesson.media.info.video!.frames = last + 1;
  context.tracking[0].samples = Array.from(
    { length: last + 1 },
    (_, frame) => ({
      frame,
      timestampMs: frame * 100,
      confidence: 0.99,
      maskPixels: 100,
      box: {
        left: left(frame),
        top: 0.3,
        right: left(frame) + 0.15,
        bottom: 0.65,
      },
    }),
  );
  draft.notes[0].supportingFrames = [
    frames.first.startFrame,
    frames.first.changeFrame,
    frames.first.resultFrame,
  ];
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
    evidenceWindow: { ...frames.first },
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
    second.execution!.evidenceWindow = { ...frames.second! };
    draft.procedure.steps.push(second);
    draft.notes.push({
      ...structuredClone(draft.notes[0]),
      stepId: second.id,
      supportingFrames: [
        frames.second!.startFrame,
        frames.second!.changeFrame,
        frames.second!.resultFrame,
      ],
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
