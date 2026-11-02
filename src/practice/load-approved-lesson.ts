import { ApprovedArtifactSchema } from "../teach/approved-artifact";
import { PracticeLessonSchema } from "./lesson";

/** Local learner import: approval is required, creator credentials are not. */
export function loadApprovedLesson(raw: string) {
  if (raw.length > 1_500_000)
    throw Error("Approved lesson exceeds the storage limit.");
  const artifact = ApprovedArtifactSchema.parse(JSON.parse(raw));
  if (!artifact.procedure.execution)
    throw Error(
      "This older approval needs a new executable review in Teach. Its original export is preserved.",
    );
  return PracticeLessonSchema.parse({
    procedure: artifact.procedure,
    zoneBindings: artifact.zoneBindings,
    sourceLesson: artifact.sourceLesson,
    automaticSetup: artifact.automaticSetup,
    origin: "teach",
  });
}
