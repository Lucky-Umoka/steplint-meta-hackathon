import { teachV3Fixture, v3Frames } from "../tests/fixtures/teach-v3";
import { localExecutionDraft } from "../src/teach/local-execution";
import { validateDraft, type TeachDraft } from "../src/teach/schema";

/**
 * A two-object V3 lesson for the Phase 2 browser journey: one mover with two
 * measured actions and one stationary object the draft wrongly calls
 * irrelevant, so the reviewer has a real role to correct. Mocked perception;
 * no model output.
 */
export function v3JourneyFixture() {
  const { context, draft, execution } = teachV3Fixture(true);
  context.selections.push({
    id: "component-2",
    description: "Stationary tray",
    frame: 0,
    mark: { kind: "box", left: 220, top: 160, right: 300, bottom: 220 },
  });
  context.tracking.push({
    componentId: "component-2",
    missingFrames: 0,
    samples: context.lesson.media.frameTimesMs.map((timestampMs, frame) => ({
      frame,
      timestampMs,
      confidence: 0.98,
      maskPixels: 80,
      box: { left: 0.7, top: 0.7, right: 0.9, bottom: 0.9 },
    })),
  });
  draft.procedure.components.push({
    id: "component-2",
    description: "Stationary tray",
    execution: {
      role: "irrelevant",
      roleReason: "Model guessed it is background",
      motion: "stationary",
      firstRequiredAt: "never",
      referenceFrames: [],
    },
  });
  const normalized: TeachDraft = localExecutionDraft(draft, execution.goal, context);
  // Shape of a real video-assisted compile result (mocked content).
  normalized.videoReview = {
    actions: normalized.procedure.steps.map((step, index) => ({
      id: `action-${index}`,
      description: step.description,
      objectIds: [step.condition.componentId],
      requirementIds: ["requirement-1"],
      stepIds: [step.id],
      evidenceWindow: step.execution!.evidenceWindow,
      visualSupport: "visible" as const,
      coverage: "represented" as const,
      reason: "Mock visual source action",
    })),
    goal: {
      description: execution.goal,
      requirementIds: ["requirement-1"],
      evidenceFrames: [v3Frames(true).last],
      limitations: ["Mocked browser evidence only"],
    },
  };
  validateDraft(normalized, context);
  return { context, draft: normalized };
}
/** The reviewer's corrections, applied through the Advanced rule editor. */
export function reviewerCorrections(draft: TeachDraft): TeachDraft {
  const next = structuredClone(draft);
  next.procedure.steps[0].description = "Slide the object to the middle mark";
  next.procedure.execution!.goal = "Object rests at the reviewed destination";
  next.procedure.components[1].execution = {
    role: "supporting",
    roleReason: "Reviewer: tray is a visible reference, not background",
    motion: "stationary",
    firstRequiredAt: "never",
    referenceFrames: [0],
  };
  return next;
}
