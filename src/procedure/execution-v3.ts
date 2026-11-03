import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const text = z.string().trim().min(1).max(2000);
const frame = z.number().int().nonnegative();
export const EvidenceWindowSchema = z
  .strictObject({
    startFrame: frame,
    changeFrame: frame,
    resultFrame: frame,
  })
  .refine(
    (w) => w.startFrame < w.changeFrame && w.changeFrame < w.resultFrame,
    "Evidence window must contain ordered start, change and result frames.",
  );

export const ComponentExecutionSchema = z.strictObject({
  role: z.enum(["required", "supporting", "irrelevant"]),
  roleReason: text,
  motion: z.enum(["stationary", "movable"]),
  firstRequiredAt: z.union([
    z.enum(["initial", "never"]),
    z.strictObject({ stepId: id }),
  ]),
  referenceFrames: z.array(frame).max(6),
});
export const StepExecutionSchema = z.strictObject({
  requiredObjectIds: z.array(id).min(1).max(4),
  evidenceWindow: EvidenceWindowSchema,
  supportedClaim: text,
  capability: z.literal("zone_transition"),
});
const predicateEvidence = {
  id,
  objectId: id,
  evidenceFrames: z.array(frame).min(1).max(6),
};
export const ScenePredicateSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...predicateEvidence,
    kind: z.literal("object_in_zone"),
    zoneId: id,
  }),
  z.strictObject({
    ...predicateEvidence,
    kind: z.literal("projected_separation"),
    otherObjectId: id,
    minimumGap: z.number().positive().max(1),
  }),
]);
export type ScenePredicate = z.infer<typeof ScenePredicateSchema>;
export const ExecutionV3Schema = z.strictObject({
  schemaVersion: z.literal(3),
  goal: text,
  goalStepIds: z.array(id).min(1).max(20),
  requirements: z
    .array(
      z.strictObject({
        id,
        description: text,
        status: z.enum(["covered", "unsupported", "outside_goal"]),
        capability: z.enum([
          "zone_transition",
          "object_in_zone",
          "projected_separation",
          "unsupported",
        ]),
        stepIds: z.array(id).max(20),
        goalPredicateIds: z.array(id).max(20),
        reason: text,
      }),
    )
    .min(1)
    .max(40),
  initialConditions: z
    .array(ScenePredicateSchema)
    .min(1)
    .max(20)
    .describe(
      "All initial predicates must cite a common actual observed source frame at or before the first step startFrame. Each cited frame must be in that initial interval.",
    ),
  finalConditions: z
    .array(ScenePredicateSchema)
    .min(1)
    .max(20)
    .describe(
      "All final predicates must cite a common actual observed source frame at or after the last step resultFrame, including a clearer later view if available. Each cited frame must be in that final interval. Never combine unrelated moments.",
    ),
});
export type ExecutionV3 = z.infer<typeof ExecutionV3Schema>;
