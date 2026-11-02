import { AutomaticSetupSchema } from "./automatic-setup";
import { z } from "zod";
import { ProcedureSpecSchema } from "../procedure/schema";
import {
  DraftSchema,
  LessonSchema,
  RegionSchema,
  ReviewSchema,
} from "./schema";
/** Validate human-approved learner exports; preserve optional legacy receipt bytes when saving. */
export const ApprovedArtifactSchema = z
  .object({
    procedure: ProcedureSpecSchema.refine(
      (p) => p.approval !== null,
      "Human approval required.",
    ),
    zoneBindings: z
      .array(
        z.strictObject({ zoneId: z.string().min(1), region: RegionSchema }),
      )
      .min(2)
      .max(100),
    review: ReviewSchema,
    lessonId: z.string().uuid(),
    notes: DraftSchema.shape.notes,
    sourceLesson: LessonSchema,
    automaticSetup: AutomaticSetupSchema.optional(),
    approvalReceipt: z.string().min(1).max(1_000_000).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.lessonId !== a.procedure.id || a.sourceLesson.lessonId !== a.lessonId)
      ctx.addIssue({
        code: "custom",
        message: "Approval source identity mismatch.",
      });
  });
