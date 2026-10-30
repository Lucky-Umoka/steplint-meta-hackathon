import { z } from "zod";
import { ProcedureSpecSchema } from "../procedure/schema";
import { DraftSchema, LessonSchema, RegionSchema, ReviewSchema } from "./schema";
/** Validate, but retain original JSON ordering when saving: the receipt hashes those bytes. */
export const ApprovedArtifactSchema = z.object({
  procedure: ProcedureSpecSchema.refine((p) => p.approval !== null, "Human approval required."),
  zoneBindings: z.array(z.strictObject({ zoneId: z.string().min(1), region: RegionSchema })).min(2).max(100),
  review: ReviewSchema, lessonId: z.string().uuid(), notes: DraftSchema.shape.notes, sourceLesson: LessonSchema,
  approvalReceipt: z.string().min(1).max(1_000_000),
}).superRefine((a, ctx) => { if (a.lessonId !== a.procedure.id || a.sourceLesson.lessonId !== a.lessonId) ctx.addIssue({ code: "custom", message: "Approval source identity mismatch." }); });
