import { z } from "zod";
import { EvidenceWindowSchema } from "../procedure/execution-v3";
import type { TeachDraft, TeachContext } from "./schema";

const id = z.string().trim().min(1).max(100);
const text = z.string().trim().min(1).max(2000);
export const VideoReviewSchema = z.strictObject({
  actions: z
    .array(
      z.strictObject({
        id,
        description: text,
        objectIds: z.array(id).max(4),
        requirementIds: z.array(id).min(1).max(40),
        stepIds: z.array(id).max(20),
        evidenceWindow: EvidenceWindowSchema.nullable(),
        visualSupport: z.enum(["visible", "unclear", "not_shown"]),
        coverage: z.enum(["represented", "unsupported", "outside_goal"]),
        reason: text,
      }),
    )
    .min(1)
    .max(40),
  goal: z.strictObject({
    description: text,
    requirementIds: z.array(id).min(1).max(40),
    evidenceFrames: z.array(z.number().int().nonnegative()).min(1).max(6),
    limitations: z.array(text).min(1).max(10),
  }),
});

/** Consistency check of model visual claims; never an independent physical verdict. */
export function validateVideoReview(
  draft: TeachDraft,
  context: TeachContext,
): void {
  const audit = draft.videoReview;
  if (!audit) return;
  const execution = draft.procedure.execution;
  if (execution?.schemaVersion !== 3)
    throw Error("Video action review requires a V3 draft.");
  const frames = context.lesson.media.frameTimesMs;
  const knownFrame = (frame: number) => frames[frame] !== undefined;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(audit.actions.map((a) => a.id)))
    throw Error("Duplicate visual action IDs.");
  for (const action of audit.actions) {
    const window = action.evidenceWindow;
    if (
      (window !== null &&
        ![window.startFrame, window.changeFrame, window.resultFrame].every(
          knownFrame,
        )) ||
      !unique(action.objectIds) ||
      !unique(action.stepIds) ||
      !unique(action.requirementIds) ||
      action.objectIds.some(
        (id) => !draft.procedure.components.some((c) => c.id === id),
      ) ||
      action.requirementIds.some(
        (id) => !execution.requirements.some((r) => r.id === id),
      )
    )
      throw Error(
        "Visual action review contains unknown or duplicate source, object or requirement references.",
      );
    if (
      action.coverage === "represented" &&
      (!window || action.visualSupport !== "visible" || !action.stepIds.length)
    )
      throw Error(
        "Unseen or ambiguous actions cannot be represented as measured steps.",
      );
    if (action.visualSupport === "not_shown" && window !== null)
      throw Error(
        "An unshown action must not invent a source evidence window.",
      );
    for (const stepId of action.stepIds) {
      const step = draft.procedure.steps.find((s) => s.id === stepId);
      if (
        !step?.execution ||
        !action.objectIds.includes(step.condition.componentId) ||
        JSON.stringify(step.execution.evidenceWindow) !==
          JSON.stringify(window) ||
        !action.requirementIds.some((id) =>
          execution.requirements.some(
            (r) => r.id === id && r.stepIds.includes(stepId),
          ),
        )
      )
        throw Error(
          "A visual action must match its owning step window, object and requirement.",
        );
    }
    if (
      action.coverage !== "represented" &&
      (action.stepIds.length ||
        action.requirementIds.some(
          (id) =>
            execution.requirements.find((r) => r.id === id)?.status !==
            (action.coverage === "unsupported"
              ? "unsupported"
              : "outside_goal"),
        ))
    )
      throw Error(
        "Unrepresented visual work must remain explicitly unsupported or outside the reviewed goal.",
      );
  }
  for (const step of draft.procedure.steps)
    if (
      audit.actions.filter(
        (a) => a.coverage === "represented" && a.stepIds.includes(step.id),
      ).length !== 1
    )
      throw Error(
        "Every generated step needs exactly one matching visible action in the video review.",
      );
  for (const requirement of execution.requirements)
    if (
      requirement.status !== "outside_goal" &&
      !audit.actions.some((action) =>
        action.requirementIds.includes(requirement.id),
      )
    )
      throw Error(
        "The visual review must retain every required goal requirement, including unsupported work.",
      );
  if (
    !unique(audit.goal.requirementIds) ||
    audit.goal.requirementIds.some(
      (id) => !execution.requirements.some((r) => r.id === id),
    ) ||
    execution.requirements.some(
      (r) =>
        r.status !== "outside_goal" &&
        !audit.goal.requirementIds.includes(r.id),
    ) ||
    audit.goal.evidenceFrames.some(
      (frame) =>
        !knownFrame(frame) ||
        !execution.finalConditions.every((p) =>
          p.evidenceFrames.includes(frame),
        ),
    )
  )
    throw Error(
      "Video goal review must reference the covered requirements and a shared observed final scene.",
    );
}
