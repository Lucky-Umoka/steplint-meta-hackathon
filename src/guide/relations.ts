import { z } from "zod";

/** Perceived physical relationships, never model-issued procedural outcomes. */
export const RelationSchema = z.enum([
  "closed",
  "open",
  "covering",
  "contained",
  "separate",
  "touching",
  "aligned",
  "misaligned",
  "unknown",
]);
export const RelationRuleSchema = z
  .strictObject({
    before: RelationSchema.exclude(["unknown"]),
    after: RelationSchema.exclude(["unknown"]),
  })
  .refine(
    (r) => r.before !== r.after,
    "A rule needs different before and after relationships.",
  );
export const RelationBoxSchema = z
  .strictObject({
    left: z.number().min(0).max(1),
    top: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
    bottom: z.number().min(0).max(1),
  })
  .refine(
    (b) => b.left < b.right && b.top < b.bottom,
    "Invalid visible extent.",
  );
export const RelationReadingSchema = z.strictObject({
  stepId: z.string().min(1).max(80),
  relation: RelationSchema,
  visibility: z.enum(["clear", "obstructed", "ambiguous", "not_visible"]),
  objectBox: RelationBoxSchema.nullable(),
  anchorBox: RelationBoxSchema.nullable(),
  description: z.string().min(1).max(300),
});
export const RelationFrameSchema = z.strictObject({
  frame: z.number().int().nonnegative(),
  readings: z.array(RelationReadingSchema).min(1).max(12),
});
export type RelationReading = z.infer<typeof RelationReadingSchema>;
export const clearRelation = (r: RelationReading | undefined) =>
  !!r &&
  r.visibility === "clear" &&
  r.relation !== "unknown" &&
  !!r.objectBox &&
  (!!r.anchorBox || r.relation === "closed");

export const RelationPlanSchema = z.strictObject({
  goalStepIds: z.array(z.string().min(1).max(80)).min(1).max(8).optional(),
  title: z.string().min(1).max(180),
  goal: z.string().min(1).max(1600),
  initialInstruction: z.string().min(1).max(1600),
  objects: z
    .array(
      z.strictObject({
        id: z.string().regex(/^component-[1-6]$/),
        label: z.string().min(1).max(100),
        description: z.string().min(1).max(400),
      }),
    )
    .min(2)
    .max(6),
  steps: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
        instruction: z.string().min(1).max(400),
        explanation: z.string().min(1).max(400),
        correction: z.string().min(1).max(400),
        objectId: z.string(),
        anchorId: z.string(),
        before: RelationSchema.exclude(["unknown"]),
        after: RelationSchema.exclude(["unknown"]),
        startMs: z.number().int().nonnegative(),
        changeMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(8),
  coverage: z
    .array(
      z.strictObject({
        instruction: z.string().min(1).max(400),
        status: z.enum(["included", "outside_goal", "unresolved"]),
        reason: z.string().min(1).max(400),
      }),
    )
    .min(1)
    .max(24),
});
export type RelationPlan = z.infer<typeof RelationPlanSchema>;

/** A detached cover exposes its reference just as an open attached cover does.
 * This mapping applies only to an explicit enclosure-opening rule. */
export function matchesRelation(
  rule: Pick<RelationPlan["steps"][number], "before" | "after">,
  reading: RelationReading,
  phase: "before" | "after",
) {
  if (reading.relation === rule[phase]) return true;
  if (rule.before === "closed" && rule.after === "open")
    return phase === "before"
      ? reading.relation === "covering"
      : reading.relation === "separate" && !!reading.anchorBox;
  return false;
}

export function validateRelationPlan(plan: RelationPlan, durationMs: number) {
  if(plan.goalStepIds&&(new Set(plan.goalStepIds).size!==plan.goalStepIds.length||plan.goalStepIds.some(id=>!plan.steps.some(s=>s.id===id))))throw Error("Unknown or duplicate final goal conditions.");
  const ids = new Set(plan.objects.map((o) => o.id));
  if (
    ids.size !== plan.objects.length ||
    new Set(plan.steps.map((s) => s.id)).size !== plan.steps.length
  )
    throw Error("Duplicate source identities.");
  for (const [i, s] of plan.steps.entries()) {
    if (
      !ids.has(s.objectId) ||
      !ids.has(s.anchorId) ||
      s.objectId === s.anchorId ||
      s.before === s.after
    )
      throw Error(
        "A step needs two distinct parts and a changed relationship.",
      );
    if (
      !(s.startMs < s.changeMs && s.changeMs < s.endMs && s.endMs <= durationMs)
    )
      throw Error(
        "An action needs actual ordered before, change and result moments.",
      );
    if (i && s.startMs < plan.steps[i - 1].endMs)
      throw Error(
        "The proposed actions overlap. Their actual order needs review.",
      );
  }
}
