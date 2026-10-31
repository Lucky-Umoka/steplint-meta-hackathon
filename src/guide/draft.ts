import { z } from "zod";
import {
  BoxSchema,
  ConditionSchema,
  EvidenceSchema,
  GuideCoverageSchema,
  GuideGeometrySchema,
  GuideImagesSchema,
  GuideObjectProfileSchema,
  GuideSourceSchema,
  GuideTextSchema,
} from "./schema";

/**
 * A reviewable analysis draft for lessons whose evidence cannot yet support
 * an executable guide. Geometry may be absent with a typed reason; nothing
 * here is executable and the approval boundary rejects every draft.
 */
export const UnresolvedObjectCodeSchema = z.enum(["no_reliable_geometry"]);
export type UnresolvedObjectCode = z.infer<typeof UnresolvedObjectCodeSchema>;

export const UnresolvedObjectSchema = z.strictObject({
  objectId: z.string().min(1).max(200),
  label: z.string().min(1).max(100),
  code: UnresolvedObjectCodeSchema,
  message: z.string().min(1).max(300),
  candidateFrame: z.number().int().nonnegative().nullable(),
  checkedSamples: z.number().int().nonnegative(),
  bestScore: z.number().min(0).max(1).nullable(),
});
export type UnresolvedObject = z.infer<typeof UnresolvedObjectSchema>;

export const UnresolvedStepCodeSchema = z.enum([
  "invalid_interval",
  "invalid_order",
  "unknown_object",
  "invalid_condition",
  "metric_unavailable",
  "insufficient_change",
  "implausible_change",
  "discontinuous_tracking",
  "missing_required_visibility",
]);
export type UnresolvedStepCode = z.infer<typeof UnresolvedStepCodeSchema>;

export const StepFailureFrameSchema = z.strictObject({
  frame: z.number().int().nonnegative(),
  timestampMs: z.number().int().nonnegative(),
  reason: z.enum(["missing", "low_score"]),
  /** Which tracked dependency failed here, when the frame is dependency-specific. */
  objectId: z.string().min(1).max(200).optional(),
});
export type StepFailureFrame = z.infer<typeof StepFailureFrameSchema>;
export const UnresolvedStepSchema = z.strictObject({
  stepId: z.string().min(1).max(200),
  code: UnresolvedStepCodeSchema,
  message: z.string().min(1).max(300),
  /** Failing frames in time order, first 60; failedFrames is the untruncated total. */
  frames: z.array(StepFailureFrameSchema).max(60).optional(),
  failedFrames: z.number().int().nonnegative().optional(),
  /** Required objects absent from the demonstrated result, when known. */
  objectIds: z.array(z.string().max(200)).max(6).optional(),
  /** Measured state change when one was computed but outside the usable range. */
  measuredChange: z.number().nullable().optional(),
});
export type UnresolvedStep = z.infer<typeof UnresolvedStepSchema>;

export const DraftObjectSchema = z
  .strictObject({
    id: z.string().min(1).max(200),
    label: z.string().min(1).max(100),
    description: GuideTextSchema,
    initiallyVisible: z.boolean(),
    sourceFrame: z.number().int().nonnegative().nullable(),
    sourceBox: BoxSchema.nullable(),
    appearance: z.null(),
    profile: GuideObjectProfileSchema.optional(),
    unresolved: UnresolvedObjectSchema.nullable(),
  })
  .superRefine((o, ctx) => {
    if ((o.sourceFrame === null) !== (o.sourceBox === null))
      ctx.addIssue({
        code: "custom",
        message: "A draft object needs both or neither of frame and box.",
      });
    if (o.unresolved === null && o.sourceBox === null)
      ctx.addIssue({
        code: "custom",
        message: "A draft object without geometry needs an unresolved reason.",
      });
    if (o.unresolved !== null && o.sourceBox !== null)
      ctx.addIssue({
        code: "custom",
        message: "A resolved draft object must not carry an unresolved reason.",
      });
  });
export type DraftObject = z.infer<typeof DraftObjectSchema>;

export const DraftStepSchema = z
  .strictObject({
    id: z.string().min(1).max(200),
    instruction: GuideTextSchema,
    explanation: GuideTextSchema,
    correction: GuideTextSchema,
    prerequisites: z.array(z.string().min(1).max(200)).max(20),
    condition: ConditionSchema.nullable(),
    evidence: EvidenceSchema.nullable(),
    uncertainties: z.array(GuideTextSchema).max(8),
    supported: z.boolean(),
    unresolved: z.array(UnresolvedStepSchema).max(7),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (s.supported) {
      if (s.condition === null || s.evidence === null || s.unresolved.length)
        fail("A supported draft step needs its rule, evidence and no issues.");
    } else if (!s.unresolved.length)
      fail("An unsupported draft step needs at least one unresolved reason.");
  });
export type DraftStep = z.infer<typeof DraftStepSchema>;

export const AnalysisDraftSchema = z
  .strictObject({
    draftVersion: z.literal(1),
    lessonId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    goal: GuideTextSchema,
    initialInstruction: GuideTextSchema,
    methodName: GuideTextSchema,
    objects: z.array(DraftObjectSchema).min(1).max(6),
    steps: z.array(DraftStepSchema).min(1).max(12),
    coverage: GuideCoverageSchema,
    goalFrame: z.number().int().nonnegative(),
    goalStepIds: z.array(z.string().min(1).max(200)).min(1).max(12),
    goalSupported: z.boolean(),
    source: GuideSourceSchema,
    images: GuideImagesSchema,
    geometry: GuideGeometrySchema,
    approval: z.null(),
  })
  .superRefine((d, ctx) => {
    if (
      !d.objects.some((o) => o.unresolved) &&
      !d.steps.some((s) => s.unresolved.length)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "A draft must record at least one unresolved object or step; fully resolved output is a guide.",
      });
  });
export type AnalysisDraft = z.infer<typeof AnalysisDraftSchema>;

/** Cheap shape check for the approval boundary; never executes a draft. */
export function looksLikeDraft(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { draftVersion?: unknown }).draftVersion === 1
  );
}

/** The single most actionable issue to show first for a draft. */
export function primaryIssue(draft: AnalysisDraft): {
  code: string;
  message: string;
} {
  const object = draft.objects.find((o) => o.unresolved);
  if (object?.unresolved)
    return { code: object.unresolved.code, message: object.unresolved.message };
  const step = draft.steps.find((s) => s.unresolved.length);
  const first = step?.unresolved[0];
  if (first) return { code: first.code, message: first.message };
  return {
    code: "unknown",
    message: "This draft still has unresolved evidence.",
  };
}
