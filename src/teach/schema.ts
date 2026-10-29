import { z } from "zod";
import { ProcedureSpecSchema } from "../procedure/schema";
import { MediaInfoSchema } from "../media/inspect";

export const MAX_TEACH_BODY = 4_000_000;
export const MAX_TEACH_VIDEO = 2_800_000;
export const MAX_TEACH_JSON = 1_500_000;
export const SESSION_MS = 30 * 60 * 1000;
export const RegionSchema = z.strictObject({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), right: z.number().min(0).max(1), bottom: z.number().min(0).max(1) }).refine((r) => r.right > r.left && r.bottom > r.top, "Region must have positive area.");
export type Region = z.infer<typeof RegionSchema>;
const pixel = z.number().int().nonnegative();
export const SelectionSchema = z.strictObject({
  id: z.string().regex(/^component-[1-4]$/), description: z.string().trim().min(1).max(100),
  frame: pixel,
  mark: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("point"), x: pixel, y: pixel }),
    z.strictObject({ kind: z.literal("box"), left: pixel, top: pixel, right: pixel, bottom: pixel }),
  ]),
});
export const SelectionsSchema = z.array(SelectionSchema).min(1).max(4).refine((items) => new Set(items.map((s) => s.id)).size === items.length, "Component IDs must be unique.");
export type Selection = z.infer<typeof SelectionSchema>;
export const TranscriptSchema = z.strictObject({
  text: z.string().trim().min(1).max(6000),
  turns: z.array(z.strictObject({ startMs: pixel, endMs: pixel, text: z.string().max(6000) }).refine((t) => t.endMs >= t.startMs, "Reversed transcript times.")).max(100),
  durationMs: z.number().positive().max(20_500),
});
export type Transcript = z.infer<typeof TranscriptSchema>;
export const LessonMediaSchema = z.strictObject({ info: MediaInfoSchema, frameTimesMs: z.array(pixel).min(1).max(600) });
export type LessonMedia = z.infer<typeof LessonMediaSchema>;
export const LessonSchema = z.strictObject({ lessonId: z.string().uuid(), media: LessonMediaSchema, transcript: TranscriptSchema });
export type Lesson = z.infer<typeof LessonSchema>;
export const TrackingSampleSchema = z.strictObject({ frame: pixel, timestampMs: pixel, box: RegionSchema, confidence: z.number().min(0).max(1).nullable(), maskPixels: z.number().int().positive().max(1280 * 720) });
export const TrackingSchema = z.array(z.strictObject({ componentId: z.string(), samples: z.array(TrackingSampleSchema).max(600), missingFrames: z.number().int().nonnegative() })).max(4);
export type Tracking = z.infer<typeof TrackingSchema>;
export const ContextSchema = z.strictObject({ lesson: LessonSchema, selections: SelectionsSchema, tracking: TrackingSchema });
export type TeachContext = z.infer<typeof ContextSchema>;
export const DraftSchema = z.strictObject({
  procedure: ProcedureSpecSchema,
  notes: z.array(z.strictObject({
    stepId: z.string().min(1), explanation: z.string().min(1).max(2000),
    candidateErrors: z.array(z.string().min(1).max(1000)).max(6),
    uncertainties: z.array(z.string().min(1).max(1000)).min(1).max(6),
    supportingFrames: z.array(pixel).min(1).max(6),
  })).min(1).max(4),
});
export type TeachDraft = z.infer<typeof DraftSchema>;
export const StepReviewSchema = z.strictObject({
  stepId: z.string(), reviewed: z.literal(true), conditionConfirmed: z.literal(true),
  fromFrame: pixel, toFrame: pixel, fromRegion: RegionSchema, toRegion: RegionSchema,
});
export const ReviewSchema = z.strictObject({ reviewer: z.string().trim().min(1).max(100), confirmed: z.literal(true), steps: z.array(StepReviewSchema).min(1).max(4) });
export type TeachReview = z.infer<typeof ReviewSchema>;

export function validateSelections(input: unknown, media: LessonMedia): Selection[] {
  const selections = SelectionsSchema.parse(input);
  const video = media.info.video;
  if (!video) throw new Error("Lesson has no video.");
  for (const s of selections) {
    if (s.frame >= media.frameTimesMs.length) throw new Error("Selected frame is outside the lesson.");
    const m = s.mark;
    if (m.kind === "point" ? m.x >= video.width || m.y >= video.height : m.left >= m.right || m.top >= m.bottom || m.right > video.width || m.bottom > video.height) throw new Error("Component mark is outside the source frame or has no area.");
  }
  return selections;
}

export function validateDraft(input: unknown, context: TeachContext): TeachDraft {
  const draft = DraftSchema.parse(input);
  const p = draft.procedure;
  if (p.approval !== null) throw new Error("A generated or edited draft must remain unapproved.");
  if (p.id !== context.lesson.lessonId || p.steps.length > 4 || p.components.length > 4) throw new Error("Draft lesson identity or step/component limit is invalid.");
  const ids = new Set(context.selections.map((s) => s.id));
  if (p.components.some((c) => !ids.has(c.id))) throw new Error("Draft invented an unselected component.");
  if (draft.notes.length !== p.steps.length || new Set(draft.notes.map((n) => n.stepId)).size !== p.steps.length) throw new Error("Every step needs exactly one review note.");
  const checkSource = (source: { sourceId: string; timestampMs: number }) => {
    if (source.sourceId !== p.id || source.timestampMs > context.lesson.media.info.durationSeconds * 1000) throw new Error("Draft source must reference this lesson and its actual timeline.");
  };
  for (const step of p.steps) {
    checkSource(step.source); checkSource(step.recovery.source);
    step.forbiddenTransitions.forEach((r) => checkSource(r.recovery.source));
    const note = draft.notes.find((n) => n.stepId === step.id);
    const track = context.tracking.find((t) => t.componentId === step.condition.componentId);
    if (!note || !track || !track.samples.length || note.supportingFrames.some((f) => !track.samples.some((s) => s.frame === f))) throw new Error("Step has no matching tracked supporting frames.");
  }
  return draft;
}

const contains = (region: Region, point: { x: number; y: number }) => point.x >= region.left && point.x <= region.right && point.y >= region.top && point.y <= region.bottom;
/** Explicit human approval plus evidence-supported zone entry; no action is inferred from masks. */
export function approveDraft(input: unknown, reviewInput: unknown, context: TeachContext, nowMs: number) {
  const draft = validateDraft(input, context);
  const review = ReviewSchema.parse(reviewInput);
  const p = draft.procedure;
  if (review.steps.length !== p.steps.length || new Set(review.steps.map((s) => s.stepId)).size !== p.steps.length) throw new Error("Review every step exactly once.");
  let priorEnd = -1;
  const zoneBindings = new Map<string, Region>();
  for (const step of p.steps) {
    const check = review.steps.find((r) => r.stepId === step.id);
    const track = context.tracking.find((t) => t.componentId === step.condition.componentId);
    if (!check || !track) throw new Error("Missing step review or visual evidence.");
    const from = track.samples.find((s) => s.frame === check.fromFrame);
    const to = track.samples.find((s) => s.frame === check.toFrame);
    if (!from || !to || from.timestampMs >= to.timestampMs || from.timestampMs <= priorEnd) throw new Error("Review requires ordered, distinct before/after evidence after earlier steps.");
    if (track.samples.some((s) => s.frame > from.frame && s.frame < to.frame && (s.confidence === null || s.confidence < step.condition.minimumConfidence)) || track.samples.filter((s) => s.frame >= from.frame && s.frame <= to.frame).length !== to.frame - from.frame + 1) throw new Error("The reviewed interval contains missing or uncertain visual evidence.");
    if (from.confidence === null || to.confidence === null || Math.min(from.confidence, to.confidence) < step.condition.minimumConfidence) throw new Error("Missing/low confidence remains unverified; choose supported evidence or revise the rule.");
    if (Math.max(check.fromRegion.left, check.toRegion.left) < Math.min(check.fromRegion.right, check.toRegion.right) && Math.max(check.fromRegion.top, check.toRegion.top) < Math.min(check.fromRegion.bottom, check.toRegion.bottom)) throw new Error("Starting and target zones overlap; draw separate observable zones.");
    const center = (r: Region) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
    if (!contains(check.fromRegion, center(from.box)) || !contains(check.toRegion, center(to.box)) || contains(check.toRegion, center(from.box))) throw new Error("Visual evidence does not show the component entering the target zone.");
    for (const [zoneId, region] of [[step.condition.fromZone, check.fromRegion], [step.condition.toZone, check.toRegion]] as const) {
      const existing = zoneBindings.get(zoneId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(region)) throw new Error("A shared zone must have one consistent region.");
      zoneBindings.set(zoneId, region);
    }
    priorEnd = to.timestampMs;
  }
  return {
    procedure: ProcedureSpecSchema.parse({ ...p, approval: { reviewer: review.reviewer, timestampMs: nowMs } }),
    zoneBindings: [...zoneBindings].map(([zoneId, region]) => ({ zoneId, region })),
    review, lessonId: context.lesson.lessonId, notes: draft.notes, sourceLesson: structuredClone(context.lesson),
  };
}
