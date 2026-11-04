import { MAX_LESSON_FRAMES } from "../media/limits";
import { z } from "zod";
import { BoxSchema } from "../guide/schema";
import type { TeachContext, TeachReview } from "./schema";
import type { ProcedureSpec } from "../procedure/schema";
import { trustedTrack } from "./source-evidence";
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
  // Role-aware (Phase 3): V3 irrelevant objects are never runtime setup;
  // supporting objects are included only when reliable source appearance
  // exists; required objects (and every V2 object) stay mandatory.
  const role = (component: ProcedureSpec["components"][number]) =>
    procedure.execution?.schemaVersion === 3
      ? (component.execution?.role ?? "required")
      : "required";
  const setupObject = (component: ProcedureSpec["components"][number]) => {
    const first = procedure.steps.find(
      (step) => step.condition.componentId === component.id,
    );
    const fixed = !first;
    const selection = context.selections.find(
      (item) => item.id === component.id,
    );
    // Stationary references are grounded from their SAM-tracked extent when a
    // trusted sample exists: a small patch around a discovery point on a plain
    // plate or lid has too little detail to match live, so automatic startup
    // could never align (live E2E run 1). The point patch is only a fallback.
    const trustedFixed = fixed
      ? trustedTrack(
          context.tracking.find((track) => track.componentId === component.id)
            ?.samples ?? [],
          context.lesson.media.frameTimesMs,
        ).filter(
          (sample) =>
            sample.box.right - sample.box.left >= 0.02 &&
            sample.box.bottom - sample.box.top >= 0.02,
        )
      : [];
    if (fixed && selection?.mark.kind === "point" && !trustedFixed.length) {
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
    const samples = trustedTrack(
      context.tracking.find((track) => track.componentId === component.id)
        ?.samples ?? [],
      context.lesson.media.frameTimesMs,
    );
    const start = fixed ? undefined : samples.find((s) => s.frame === frame);
    // A mover's identity view: an approved reference frame before its action
    // where it already sits at the same starting position, so the template is
    // not captured with the demonstrator's hand on it (live E2E run 1). The
    // action-start frame is the fallback.
    const centre = (b: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
    const identityView =
      start && component.execution?.referenceFrames.length
        ? samples
            .filter(
              (s) =>
                s.frame < frame &&
                component.execution!.referenceFrames.includes(s.frame) &&
                Math.hypot(
                  centre(s.box)[0] - centre(start.box)[0],
                  centre(s.box)[1] - centre(start.box)[1],
                ) <= 0.02,
            )
            .sort((a, b) => a.frame - b.frame)[0]
        : undefined;
    // Stationary references: their earliest approved reference view (before
    // the demonstrator touches anything), else the sample nearest the scene.
    const fixedView = fixed
      ? (samples
          .filter((s) => component.execution?.referenceFrames.includes(s.frame))
          .sort((a, b) => a.frame - b.frame)[0] ??
        [...samples].sort(
          (a, b) => Math.abs(a.frame - frame) - Math.abs(b.frame - frame),
        )[0])
      : undefined;
    const sample = fixed ? fixedView : (identityView ?? start);
    if (!sample)
      throw Error(
        `No reliable source appearance for ${component.description}. Review its starting view.`,
      );
    return { id: component.id, fixed, frame: sample.frame, box: sample.box };
  };
  // Paid run 17: the draft labelled the lid and plate "irrelevant" (they
  // only define zones), leaving Practice without stationary references. An
  // unmoved irrelevant object whose reliable Teach box (nearest the scene
  // frame) holds an approved zone centre is that zone's physical anchor: it is
  // set up as an optional fixed reference, never a step or goal object.
  const zoneCentres = review.steps
    .flatMap((step) => [step.fromRegion, step.toRegion])
    .map((r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }));
  const zoneAnchor = (component: ProcedureSpec["components"][number]) => {
    if (
      procedure.execution?.schemaVersion !== 3 ||
      role(component) !== "irrelevant" ||
      component.execution?.motion !== "stationary" ||
      procedure.steps.some((s) => s.condition.componentId === component.id)
    )
      return false;
    const nearest = trustedTrack(
      context.tracking.find((t) => t.componentId === component.id)?.samples ??
        [],
      context.lesson.media.frameTimesMs,
    ).sort(
      (a, b) => Math.abs(a.frame - sceneFrame) - Math.abs(b.frame - sceneFrame),
    )[0];
    return (
      !!nearest &&
      zoneCentres.some(
        (c) =>
          c.x >= nearest.box.left &&
          c.x <= nearest.box.right &&
          c.y >= nearest.box.top &&
          c.y <= nearest.box.bottom,
      )
    );
  };
  const objects = procedure.components
    .filter(
      (component) => role(component) !== "irrelevant" || zoneAnchor(component),
    )
    .flatMap((component) => {
      try {
        return [setupObject(component)];
      } catch (error) {
        if (role(component) !== "required") return [];
        throw error;
      }
    });
  if (!objects.length)
    throw Error("No required object has a reliable source appearance.");
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
/**
 * V3 lessons start Practice automatically from reviewed Teach references, so
 * setup is mandatory and must describe exactly this procedure: one entry per
 * component and an image for the scene and every object reference frame.
 */
export function automaticSetupIssue(
  procedure: ProcedureSpec,
  setup: AutomaticSetup | undefined,
): string | null {
  if (procedure.execution?.schemaVersion !== 3) return null;
  if (!setup)
    return "Automatic setup is missing: the reviewed source frames were not extracted. Return to Teach review and approve or rehearse again.";
  const ids = new Set(setup.objects.map((object) => object.id));
  const role = (c: ProcedureSpec["components"][number]) =>
    c.execution?.role ?? "required";
  const frames = new Set(setup.frames.map((frame) => frame.frame));
  if (
    ids.size !== setup.objects.length ||
    procedure.components.some(
      (c) =>
        (role(c) === "required" && !ids.has(c.id)) ||
        // Irrelevant objects appear only as fixed zone anchors.
        (role(c) === "irrelevant" &&
          setup.objects.some((o) => o.id === c.id && !o.fixed)),
    ) ||
    [...ids].some((id) => !procedure.components.some((c) => c.id === id)) ||
    !frames.has(setup.sceneFrame) ||
    setup.objects.some((object) => !frames.has(object.frame))
  )
    return "Automatic setup does not match this procedure's objects and reviewed frames. Return to Teach review.";
  return null;
}
