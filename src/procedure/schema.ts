import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const description = z.string().trim().min(1).max(2000);
export const TimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const EvidenceReferenceSchema = z.strictObject({
  sourceId: id,
  timestampMs: TimestampSchema,
  description,
});
export const ComponentSchema = z.strictObject({ id, description });
export const VisualConditionSchema = z.strictObject({
  kind: z.literal("enters_zone"),
  componentId: id,
  fromZone: id,
  toZone: id,
  minimumConfidence: z.number().min(0).max(1),
});
export const RecoverySchema = z.strictObject({
  instruction: description,
  source: EvidenceReferenceSchema,
});
export const MeasurementSchema = z.strictObject({
  method: z.literal("zone_transition"),
  point: z.enum(["center", "bottom_center"]).default("center"),
  maximumPositionDrift: z.number().min(0.002).max(0.05).default(0.01),
  minimumFreshFrames: z.number().int().min(3).max(20),
  stableForMs: z.number().int().min(200).max(2000),
  maxObservationGapMs: z.number().int().min(100).max(1000),
  persistence: z.enum(["maintain", "release_on_later_step"]),
  releaseStepId: id.nullable(),
  reversalRecovery: z.enum(["restore_target", "repeat_transition"]),
  forbiddenZoneIds: z.array(id).max(20),
  sourceFrames: z
    .strictObject({
      start: z.number().int().nonnegative(),
      change: z.number().int().nonnegative(),
      result: z.number().int().nonnegative(),
    })
    .refine(
      (f) => f.start < f.change && f.change < f.result,
      "Source start/change/result must be distinct and ordered.",
    )
    .optional(),
});
export const ExecutionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  goal: description,
  goalStepIds: z.array(id).min(1).max(100),
  requirements: z
    .array(
      z.strictObject({
        description,
        status: z.enum(["covered", "unsupported", "outside_goal"]),
        stepIds: z.array(id).max(100),
        reason: description,
      }),
    )
    .min(1)
    .max(100),
});
export const StepSchema = z.strictObject({
  id,
  description,
  prerequisites: z.array(id).max(100),
  measurement: MeasurementSchema.optional(),
  condition: VisualConditionSchema,
  // This transition is prohibited until the named earlier steps are verified.
  forbiddenTransitions: z
    .array(
      z.strictObject({
        condition: VisualConditionSchema,
        unlessVerified: z.array(id).min(1).max(100),
        recovery: RecoverySchema,
      }),
    )
    .max(100),
  recovery: RecoverySchema,
  source: EvidenceReferenceSchema,
});
export const ProcedureSpecSchema = z
  .strictObject({
    id,
    version: z.number().int().positive(),
    title: description,
    components: z.array(ComponentSchema).min(1).max(100),
    zones: z.array(z.strictObject({ id, description })).min(2).max(100),
    steps: z.array(StepSchema).min(1).max(100),
    execution: ExecutionSchema.optional(),
    approval: z
      .strictObject({ reviewer: id, timestampMs: TimestampSchema })
      .nullable(),
  })
  .superRefine((spec, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const unique = (values: string[], label: string) => {
      if (new Set(values).size !== values.length) issue(`Duplicate ${label}.`);
    };
    unique(
      spec.components.map((x) => x.id),
      "component IDs",
    );
    unique(
      spec.zones.map((x) => x.id),
      "zone IDs",
    );
    unique(
      spec.steps.map((x) => x.id),
      "step IDs",
    );
    // Demo deliberately has one transition per component, avoiding ambiguous matches.
    if (!spec.execution)
      unique(
        spec.steps.map((x) => x.condition.componentId),
        "step components",
      );
    const components = new Set(spec.components.map((x) => x.id));
    const zones = new Set(spec.zones.map((x) => x.id));
    const validateCondition = (
      condition: z.infer<typeof VisualConditionSchema>,
    ) => {
      if (!components.has(condition.componentId))
        issue("Unknown condition component.");
      if (!zones.has(condition.fromZone) || !zones.has(condition.toZone))
        issue("Unknown condition zone.");
      if (condition.fromZone === condition.toZone)
        issue("A transition must change zones.");
    };
    if (spec.execution) {
      unique(spec.execution.goalStepIds, "goal step IDs");
      if (
        spec.execution.goalStepIds.some(
          (id) => !spec.steps.some((step) => step.id === id),
        )
      )
        issue("Unknown final goal step.");
      if (
        spec.execution.requirements.some(
          (r) =>
            r.stepIds.some(
              (id) => !spec.steps.some((step) => step.id === id),
            ) ||
            (r.status === "covered" && !r.stepIds.length),
        )
      )
        issue("Coverage references must name actual measured steps.");
      if (
        spec.approval &&
        spec.execution.requirements.some((r) => r.status === "unsupported")
      )
        issue("Unsupported required work cannot be approved.");
    }
    spec.steps.forEach((step, index) => {
      const earlier = new Set(spec.steps.slice(0, index).map((x) => x.id));
      unique(step.prerequisites, "prerequisites");
      if (step.prerequisites.some((x) => !earlier.has(x)))
        issue("Prerequisites must reference earlier steps (no cycles).");
      validateCondition(step.condition);
      if (spec.execution && !step.measurement)
        issue("Local execution requires an explicit step measurement.");
      if (!spec.execution && step.measurement)
        issue("Measurement extensions require a versioned execution contract.");
      const m = step.measurement;
      if (spec.execution && m) {
        const next = spec.steps
          .slice(index + 1)
          .find((s) => s.condition.componentId === step.condition.componentId);
        if (
          next &&
          (m.persistence !== "release_on_later_step" ||
            m.releaseStepId !== next.id ||
            next.condition.fromZone !== step.condition.toZone)
        )
          issue(
            "Repeated-object actions require an explicit continuous release to their next action.",
          );
        if (next?.measurement && next.measurement.point !== m.point)
          issue("Repeated-object actions must retain the same measured point.");
        if (
          spec.execution.goalStepIds.includes(step.id) &&
          m.persistence !== "maintain"
        )
          issue("Final goal conditions must remain maintained.");
      }

      if (m) {
        unique(m.forbiddenZoneIds, "forbidden destination IDs");
        if (
          m.forbiddenZoneIds.some(
            (id) =>
              !zones.has(id) ||
              id === step.condition.toZone ||
              id === step.condition.fromZone,
          )
        )
          issue("Invalid forbidden destination.");
        if (m.persistence === "release_on_later_step") {
          const later = spec.steps
            .slice(index + 1)
            .find((s) => s.id === m.releaseStepId);
          if (
            !later ||
            later.condition.componentId !== step.condition.componentId ||
            later.condition.fromZone !== step.condition.toZone
          )
            issue(
              "Release must name a later action of the same component from its current target.",
            );
        } else if (m.releaseStepId !== null)
          issue("Maintained state cannot have a release step.");
        if (spec.approval && !m.sourceFrames)
          issue(
            "Approved local steps require source start/change/result references.",
          );
      }
      for (const rule of step.forbiddenTransitions) {
        validateCondition(rule.condition);
        if (rule.condition.componentId !== step.condition.componentId)
          issue("Forbidden transition must concern its owning step component.");
        unique(rule.unlessVerified, "forbidden-transition prerequisites");
        if (rule.unlessVerified.some((x) => !earlier.has(x)))
          issue("Forbidden transitions must reference earlier steps.");
      }
    });
  });
export type ProcedureSpec = z.infer<typeof ProcedureSpecSchema>;
export type ProcedureStep = z.infer<typeof StepSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ComponentId = Component["id"];
export type VisualCondition = z.infer<typeof VisualConditionSchema>;
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
export type RecoveryInstruction = z.infer<typeof RecoverySchema>;

export const ObservationSchema = z
  .strictObject({
    id,
    objectId: id,
    timestampMs: TimestampSchema,
    quality: z.enum([
      "observed",
      "unknown",
      "missing",
      "ambiguous",
      "obstructed",
    ]),
    zone: id.nullable(),
    location: z
      .strictObject({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
      .nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    evidence: EvidenceReferenceSchema,
    spatialState: z.enum(["zone", "transit"]).optional(),
    identityOnly: z.boolean().optional(),
    visibleFraction: z.number().min(0).max(1).optional(),
    onsetMs: TimestampSchema.optional(),
    sourceObservedAtMs: TimestampSchema.optional(),
    frameId: id.optional(),
    pendingPrerequisites: z.array(id).max(100).optional(),
  })
  .superRefine((observation, ctx) => {
    if (
      observation.identityOnly &&
      (observation.quality !== "observed" ||
        observation.zone !== null ||
        observation.spatialState !== "transit")
    )
      ctx.addIssue({
        code: "custom",
        message: "Partial identity cannot provide verified endpoint geometry.",
      });

    if (
      observation.quality === "observed" &&
      ((observation.zone === null && observation.spatialState !== "transit") ||
        observation.confidence === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Observed evidence requires a zone and confidence.",
      });
    }
    if (
      observation.onsetMs !== undefined &&
      observation.onsetMs > observation.timestampMs
    )
      ctx.addIssue({
        code: "custom",
        message: "An observed onset cannot be in the future.",
      });
    if (
      observation.sourceObservedAtMs !== undefined &&
      observation.sourceObservedAtMs >
        (observation.onsetMs ?? observation.timestampMs)
    )
      ctx.addIssue({
        code: "custom",
        message: "Origin evidence must precede the observed result.",
      });
    if (observation.evidence.timestampMs !== observation.timestampMs) {
      ctx.addIssue({
        code: "custom",
        message: "Evidence timestamp must match observation timestamp.",
      });
    }
  });
export type Observation = z.infer<typeof ObservationSchema>;
export const InputEventSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("observation"),
      id,
      timestampMs: TimestampSchema,
      observation: ObservationSchema,
    }),
    z.strictObject({
      type: z.literal("reset"),
      id,
      timestampMs: TimestampSchema,
    }),
    z.strictObject({
      type: z.literal("retry"),
      id,
      timestampMs: TimestampSchema,
      stepId: id,
    }),
  ])
  .superRefine((event, ctx) => {
    if (
      event.type === "observation" &&
      event.timestampMs !== event.observation.timestampMs
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Event and observation timestamps must match.",
      });
    }
  });
export type InputEvent = z.infer<typeof InputEventSchema>;
export const StepStatusSchema = z.enum([
  "pending",
  "blocked",
  "passed",
  "failed",
  "needs_verification",
]);
export const StepStateSchema = z.strictObject({
  stepId: id,
  status: StepStatusSchema,
  verifiedAtMs: TimestampSchema.nullable(),
});
export const VerificationEventSchema = z.strictObject({
  eventId: id,
  timestampMs: TimestampSchema,
  stepId: id.nullable(),
  status: z.enum([
    "passed",
    "failed",
    "needs_verification",
    "ignored",
    "reset",
    "retry",
  ]),
  reason: description,
  missingPrerequisites: z.array(id),
  evidence: z.array(EvidenceReferenceSchema),
  recovery: RecoverySchema.nullable(),
  observedAtMs: TimestampSchema.optional(),
  decision: z.enum(["transition", "reversal", "restoration"]).optional(),
});
export type VerificationEvent = z.infer<typeof VerificationEventSchema>;
export const VerificationResultSchema = z.strictObject({
  procedureId: id,
  procedureVersion: z.number().int().positive(),
  status: z.enum([
    "pending",
    "in_progress",
    "passed",
    "failed",
    "needs_verification",
  ]),
  steps: z.array(StepStateSchema),
  events: z.array(VerificationEventSchema),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
