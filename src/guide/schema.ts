import { z } from "zod";
import { TranscriptSchema, RegionSchema } from "../teach/schema";
import {
  RelationRuleSchema,
  RelationPlanSchema,
  RelationFrameSchema,
} from "./relations";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text = z.string().trim().min(1).max(1600);
export const GuideIdSchema = id;
export const GuideTextSchema = text;
export const ImageSchema = z
  .string()
  .max(450_000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
export const BoxSchema = RegionSchema;
export type Box = z.infer<typeof BoxSchema>;
export const GuideObjectProfileSchema = z.strictObject({
  role: z.enum(["task_part", "reference"]),
  material: z
    .enum(["opaque", "transparent", "reflective", "unknown"])
    .optional(),
  namesHeard: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(80),
        turnId: z.number().int().nonnegative(),
      }),
    )
    .max(6),
  appearances: z
    .array(
      z.strictObject({
        frame: z.number().int().nonnegative(),
        description: z.string().min(1).max(300),
      }),
    )
    .max(3),
});
export const ObjectSchema = z.strictObject({
  id,
  label: z.string().min(1).max(100),
  description: text,
  initiallyVisible: z.boolean(),
  sourceFrame: z.number().int().nonnegative(),
  sourceBox: BoxSchema,
  appearance: ImageSchema.nullable(),
  profile: GuideObjectProfileSchema.optional(),
});
export const EvidenceSchema = z
  .strictObject({
    startFrame: z.number().int().nonnegative(),
    changeFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().nonnegative(),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    turnIds: z.array(z.number().int().nonnegative()).max(100),
  })
  .refine(
    (x) =>
      x.startFrame < x.endFrame &&
      x.changeFrame >= x.startFrame &&
      x.changeFrame <= x.endFrame &&
      x.startMs < x.endMs,
    "A step needs ordered observed start/change/result evidence.",
  );
export const ConditionSchema = z
  .strictObject({
    kind: z.enum(["movement", "separation", "visual_relation"]),
    objectId: id,
    anchorId: id.nullable(),
    minimumChange: z.number().min(0.15).max(12),
    requiredVisibleAfter: z.array(id).max(6),
    relation: RelationRuleSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (
      (c.kind === "visual_relation") !== !!c.relation ||
      (c.kind === "visual_relation" &&
        (!c.anchorId || c.anchorId === c.objectId))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Visual relations require their own explicit rule and reference.",
      });
    if (c.kind === "separation" && (!c.anchorId || c.anchorId === c.objectId))
      ctx.addIssue({
        code: "custom",
        message: "Separation needs a distinct visible reference object.",
      });
    if (c.kind === "movement" && c.anchorId !== null)
      ctx.addIssue({
        code: "custom",
        message: "Movement uses its own observed starting position.",
      });
  });
export const GuideStepSchema = z.strictObject({
  id,
  instruction: text,
  explanation: text,
  correction: text,
  prerequisites: z.array(id).max(20),
  condition: ConditionSchema,
  evidence: EvidenceSchema,
  uncertainties: z.array(text).max(8),
  supported: z.boolean(),
});
export const GuideCoverageSchema = z
  .array(
    z.strictObject({
      instruction: text,
      status: z.enum(["included", "outside_goal", "unresolved"]),
      reason: text,
    }),
  )
  .min(1)
  .max(24);
export const GuideSourceSchema = z.strictObject({
  durationMs: z.number().positive().max(20500),
  width: z.number().int().positive().max(1280),
  height: z.number().int().positive().max(720),
  frameTimesMs: z.array(z.number().int().nonnegative()).min(2).max(600),
  transcript: TranscriptSchema,
  teachingIntent: z.string().trim().min(1).max(400).optional(),
  tracking: z
    .array(
      z.strictObject({
        objectId: id,
        observedFrames: z.number().int().nonnegative(),
        trustedFrames: z.number().int().nonnegative(),
        totalFrames: z.number().int().positive(),
        longestTrustedRun: z.number().int().nonnegative(),
      }),
    )
    .max(6)
    .optional(),
});
export const GuideImagesSchema = z
  .array(
    z.strictObject({
      frame: z.number().int().nonnegative(),
      image: ImageSchema,
    }),
  )
  .max(48);
export const GuideGeometrySchema = z
  .array(
    z.strictObject({
      frame: z.number().int().nonnegative(),
      objectId: id,
      box: BoxSchema,
      confidence: z.number().min(0).max(1),
    }),
  )
  .max(3600);
export const GuideSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    relationPlan: RelationPlanSchema.optional(),
    relationEvidence: z.array(RelationFrameSchema).max(48).optional(),
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    parentRevision: z.number().int().positive().nullable(),
    methodId: id,
    methodName: text,
    title: z.string().trim().min(1).max(180),
    goal: text,
    initialInstruction: text,
    objects: z.array(ObjectSchema).min(1).max(6),
    steps: z.array(GuideStepSchema).min(1).max(12),
    coverage: GuideCoverageSchema,
    goalFrame: z.number().int().nonnegative(),
    goalStepIds: z.array(id).min(1).max(12),
    goalSupported: z.boolean(),
    source: GuideSourceSchema,
    images: GuideImagesSchema,
    geometry: GuideGeometrySchema,
    approval: z
      .strictObject({
        reviewer: z.string().trim().min(1).max(100),
        at: z.number().int().nonnegative(),
        purpose: z.enum(["rehearsal", "published"]),
        testOnly: z.boolean(),
        contentHash: z.string().length(64),
      })
      .nullable(),
  })
  .superRefine((g, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (g.relationPlan) {
      if (
        g.methodId !== "visual-relations-v1" ||
        g.relationPlan.steps.length !== g.steps.length ||
        g.steps.some((s, i) => {
          const p = g.relationPlan!.steps[i];
          return (
            s.condition.kind !== "visual_relation" ||
            p.id !== s.id ||
            p.objectId !== s.condition.objectId ||
            p.anchorId !== s.condition.anchorId ||
            p.before !== s.condition.relation?.before ||
            p.after !== s.condition.relation?.after
          );
        })
      )
        fail("Relationship rules must match their reviewed perception plan.");
    } else if (g.steps.some((s) => s.condition.kind === "visual_relation"))
      fail("A relationship guide needs its explicit perception plan.");
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    if (
      !unique(g.objects.map((o) => o.id)) ||
      !unique(g.steps.map((s) => s.id))
    )
      fail("Object and step identities must be unique.");
    const objects = new Set(g.objects.map((o) => o.id));
    if (
      g.goalStepIds.some((id) => !g.steps.some((s) => s.id === id)) ||
      new Set(g.goalStepIds).size !== g.goalStepIds.length
    )
      fail("Unknown or duplicate goal conditions.");
    const frame = (n: number) => n < g.source.frameTimesMs.length;
    if (g.goalFrame < g.steps.at(-1)!.evidence.endFrame)
      fail("The final goal must follow the demonstrated steps.");
    if (
      g.objects.some(
        (o) =>
          o.profile &&
          (o.profile.appearances.some((a) => !frame(a.frame)) ||
            o.profile.namesHeard.some(
              (name) =>
                !g.source.transcript.turns[name.turnId]?.text
                  .toLocaleLowerCase()
                  .includes(name.name.toLocaleLowerCase()),
            )),
      )
    )
      fail("Object names/appearances must reference actual source evidence.");
    if (
      g.source.tracking &&
      (new Set(g.source.tracking.map((item) => item.objectId)).size !==
        g.source.tracking.length ||
        g.source.tracking.some(
          (item) =>
            !objects.has(item.objectId) ||
            item.trustedFrames > item.observedFrames ||
            item.observedFrames > item.totalFrames ||
            item.totalFrames !== g.source.frameTimesMs.length ||
            item.longestTrustedRun > item.trustedFrames,
        ))
    )
      fail("Source tracking counts must match the actual observed frames.");
    if (g.geometry.some((x) => !frame(x.frame) || !objects.has(x.objectId)))
      fail("Unknown source geometry.");
    if (
      !frame(g.goalFrame) ||
      g.objects.some((o) => !frame(o.sourceFrame)) ||
      g.images.some((i) => !frame(i.frame)) ||
      new Set(g.images.map((i) => i.frame)).size !== g.images.length
    )
      fail("Reference frame is outside this lesson or duplicated.");
    if (
      g.source.frameTimesMs.some(
        (t, i, arr) => t > g.source.durationMs || (i > 0 && t <= arr[i - 1]),
      )
    )
      fail("Ambiguous source timeline.");
    g.steps.forEach((s, i) => {
      if (
        !objects.has(s.condition.objectId) ||
        (s.condition.anchorId && !objects.has(s.condition.anchorId)) ||
        s.condition.requiredVisibleAfter.some((id) => !objects.has(id))
      )
        fail("A step references an unknown object.");
      const before = new Set(g.steps.slice(0, i).map((s) => s.id));
      if (
        s.prerequisites.some((id) => !before.has(id)) ||
        !unique(s.prerequisites)
      )
        fail("Prerequisites must be distinct earlier steps.");
      if (
        !frame(s.evidence.startFrame) ||
        !frame(s.evidence.endFrame) ||
        !frame(s.evidence.changeFrame) ||
        s.evidence.startMs !== g.source.frameTimesMs[s.evidence.startFrame] ||
        s.evidence.endMs !== g.source.frameTimesMs[s.evidence.endFrame]
      )
        fail("Step times must match actual source frames.");
      if (s.evidence.turnIds.some((i) => i >= g.source.transcript.turns.length))
        fail("Unknown transcript turn.");
      if (i > 0 && s.evidence.startMs < g.steps[i - 1].evidence.endMs)
        fail("Demonstrated step intervals must be ordered.");
    });
  });
export type Guide = z.infer<typeof GuideSchema>;
export type GuideStep = Guide["steps"][number];
export const ArtifactSchema = z
  .strictObject({ guide: GuideSchema, receipt: z.string().min(1).max(20_000) })
  .refine(
    (a) => a.guide.approval !== null,
    "Explicit review approval is required.",
  );
export type GuideArtifact = z.infer<typeof ArtifactSchema>;
export const DetectionSchema = z
  .strictObject({
    objectId: id,
    quality: z.enum(["observed", "missing", "ambiguous", "obstructed"]),
    box: BoxSchema.nullable(),
    score: z.number().min(0).max(1).nullable(),
  })
  .superRefine((o, ctx) => {
    if (o.quality === "observed" && (!o.box || o.score === null))
      ctx.addIssue({
        code: "custom",
        message: "Observed geometry and quality are required.",
      });
  });
export type ObjectDetection = z.infer<typeof DetectionSchema>;
export const ObservationSchema = z.strictObject({
  id: z.string().min(1).max(100),
  timestampMs: z.number().int().nonnegative(),
  cameraEpoch: z.string().min(1).max(100),
  objects: z.array(DetectionSchema).max(6),
});
export type GuideObservation = z.infer<typeof ObservationSchema>;
/** Readiness is not approval or correctness. */
export function guideBlockers(g: Guide): string[] {
  const issues: string[] = [];
  if (!g.goalSupported)
    issues.push("The final goal needs clear visual evidence.");
  if (g.coverage.some((c) => c.status === "unresolved"))
    issues.push(
      "Some instructions still need source evidence or a clear scope decision.",
    );
  g.steps.forEach((s, i) => {
    if (!s.supported)
      issues.push(g.relationPlan ? `Step ${i + 1} needs a clearly observed starting relationship and result.` : `Step ${i + 1} needs clearer tracked movement.`);
    for (const f of [
      s.evidence.startFrame,
      s.evidence.changeFrame,
      s.evidence.endFrame,
    ])
      if (!g.images.some((i) => i.frame === f))
        issues.push(`Step ${i + 1} is missing a reference image.`);
  });
  if (!g.images.some((i) => i.frame === g.goalFrame))
    issues.push("The goal needs a reference image.");
  return [...new Set(issues)];
}
