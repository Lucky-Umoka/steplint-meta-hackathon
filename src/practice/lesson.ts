import { z } from "zod";
import { ProcedureSpecSchema } from "../procedure/schema";
import { LessonSchema } from "../teach/schema";
import { ZoneBindingsSchema, validateSetup } from "./pipeline";
export const PracticeLessonSchema = z.object({ procedure: ProcedureSpecSchema, zoneBindings: ZoneBindingsSchema, sourceLesson: LessonSchema.nullable(), origin: z.enum(["teach", "controlled-fixture"]) }).superRefine((lesson, ctx) => {
  if (!lesson.procedure.approval) ctx.addIssue({ code: "custom", message: "Unapproved procedures cannot be practiced." });
  if (lesson.origin === "teach" && (!lesson.sourceLesson || lesson.sourceLesson.lessonId !== lesson.procedure.id)) ctx.addIssue({ code: "custom", message: "Teaching source identity mismatch." });
  try { validateSetup(lesson.procedure, lesson.zoneBindings); } catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid zones" }); }
});
export type PracticeLesson = z.infer<typeof PracticeLessonSchema>;
