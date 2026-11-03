import { AutomaticSetupSchema, automaticSetupIssue } from "./automatic-setup";
import { RehearsalSchema } from "./rehearsal";
import { executableRevision } from "./revision";
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
    /** V3 only: creator rehearsal bound to the approved revision. */
    rehearsal: RehearsalSchema.optional(),
  })
  .superRefine((a, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (a.lessonId !== a.procedure.id || a.sourceLesson.lessonId !== a.lessonId)
      issue("Approval source identity mismatch.");
    if (a.procedure.execution?.schemaVersion !== 3) {
      // V2 compatibility path: unchanged contract, never presented as V3.
      if (a.rehearsal || a.procedure.approval?.revision)
        issue("Older (V2) approvals cannot carry V3 revision or rehearsal fields.");
      return;
    }
    const setupIssue = automaticSetupIssue(a.procedure, a.automaticSetup);
    if (setupIssue) issue(setupIssue);
    if (!a.rehearsal) issue("V3 approval must record its rehearsal status.");
    const revision = executableRevision(a);
    if (a.procedure.approval?.revision !== revision)
      issue(
        "This approval is stale: the executable lesson changed after it was approved. Review and approve it again in Teach.",
      );
    if (a.rehearsal && a.rehearsal.status !== "not_run" && a.rehearsal.revision !== revision)
      issue(
        "Rehearsal evidence belongs to a different revision of this lesson and cannot be reused.",
      );
  });
/** Parse a stored/imported approval, reporting validation messages as plain sentences. */
export function parseApprovedArtifact(value: unknown) {
  const parsed = ApprovedArtifactSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))];
  throw Error(
    `This saved lesson cannot be used: ${messages.slice(0, 4).join(" ")}`,
  );
}
