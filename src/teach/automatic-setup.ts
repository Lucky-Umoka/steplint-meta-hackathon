import { MAX_LESSON_FRAMES } from "../media/limits";
import { z } from "zod";
import { BoxSchema } from "../guide/schema";
import type { TeachContext, TeachReview } from "./schema";
import type { ProcedureSpec } from "../procedure/schema";
const jpeg = z
  .string()
  .max(120_000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
export const SetupFrameSchema = z.strictObject({
  frame: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_LESSON_FRAMES - 1),
  image: jpeg,
});
export const AutomaticSetupSchema = z.strictObject({
  sceneFrame: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_LESSON_FRAMES - 1),
  objects: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        frame: z
          .number()
          .int()
          .nonnegative()
          .max(MAX_LESSON_FRAMES - 1),
        box: BoxSchema,
        fixed: z.boolean(),
      }),
    )
    .min(1)
    .max(4),
  frames: z.array(SetupFrameSchema).min(1).max(6),
});
export type AutomaticSetup = z.infer<typeof AutomaticSetupSchema>;
/** Source geometry comes from the sealed Teach context, never a client-supplied live box. */
export function automaticSetupPlan(
  procedure: ProcedureSpec,
  review: TeachReview,
  context: TeachContext,
) {
  const sceneFrame = review.steps[0].fromFrame;
  const video = context.lesson.media.info.video;
  if (!video) throw Error("The source video dimensions are missing.");
  const objects = procedure.components.map((component) => {
    const first = procedure.steps.find(
      (step) => step.condition.componentId === component.id,
    );
    const fixed = !first;
    const selection = context.selections.find(
      (item) => item.id === component.id,
    );
    if (fixed && selection?.mark.kind === "point") {
      const x = selection.mark.x / video.width,
        y = selection.mark.y / video.height;
      return {
        id: component.id,
        fixed,
        frame: selection.frame,
        box: {
          left: Math.max(0, x - 0.04),
          top: Math.max(0, y - 0.04),
          right: Math.min(1, x + 0.04),
          bottom: Math.min(1, y + 0.04),
        },
      };
    }
    const frame = first
      ? review.steps.find((step) => step.stepId === first.id)!.fromFrame
      : sceneFrame;
    const samples =
      context.tracking
        .find((track) => track.componentId === component.id)
        ?.samples.filter(
          (sample) => sample.confidence !== null && sample.confidence >= 0.9,
        ) ?? [];
    const sample = fixed
      ? [...samples].sort(
          (a, b) => Math.abs(a.frame - frame) - Math.abs(b.frame - frame),
        )[0]
      : samples.find((sample) => sample.frame === frame);
    if (!sample)
      throw Error(
        `No reliable source appearance for ${component.description}. Review its starting view.`,
      );
    return { id: component.id, fixed, frame: sample.frame, box: sample.box };
  });
  return {
    sceneFrame,
    goalFrame: Math.max(...review.steps.map((step) => step.toFrame)),
    objects,
  };
}
export function bindAutomaticSetup(
  plan: ReturnType<typeof automaticSetupPlan>,
  frames: z.infer<typeof SetupFrameSchema>[],
): AutomaticSetup {
  const required = new Set([
    plan.sceneFrame,
    ...plan.objects.map((object) => object.frame),
  ]);
  // Older clients supplied identity frames only. Keep their approvals valid;
  // new clients also include the reviewed result for portable goal previews.
  if (frames.some((frame) => frame.frame === plan.goalFrame))
    required.add(plan.goalFrame);
  if (
    frames.length !== required.size ||
    new Set(frames.map((frame) => frame.frame)).size !== frames.length ||
    frames.some((frame) => !required.has(frame.frame))
  )
    throw Error(
      "Automatic setup must contain exactly the reviewed source frames.",
    );
  return AutomaticSetupSchema.parse({
    sceneFrame: plan.sceneFrame,
    objects: plan.objects,
    frames,
  });
}
