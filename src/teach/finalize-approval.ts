import type { z } from "zod";
import { ProcedureSpecSchema } from "../procedure/schema";
import { ApprovedArtifactSchema } from "./approved-artifact";
import {
  automaticSetupPlan,
  bindAutomaticSetup,
  type SetupFrameSchema,
} from "./automatic-setup";
import { bindRehearsal } from "./rehearsal";
import { executableRevision } from "./revision";
import type { approveDraft, TeachContext } from "./schema";

/**
 * The approve handler's final step after human review and image checks: bind
 * automatic setup from the sealed context, then for V3 stamp the executable
 * revision and bind (or reset) rehearsal evidence. Shared so browser tests run
 * exactly this logic without a creator session or model calls.
 */
export function finalizeApprovedLesson(
  reviewed: ReturnType<typeof approveDraft>,
  context: TeachContext,
  setupFrames: z.infer<typeof SetupFrameSchema>[] | undefined,
  claimedRehearsal: unknown,
) {
  const v3 = reviewed.procedure.execution?.schemaVersion === 3;
  if (v3 && !setupFrames)
    throw Error("Automatic setup frames are required to approve this lesson.");
  const withSetup =
    setupFrames && reviewed.procedure.execution
      ? {
          ...reviewed,
          automaticSetup: bindAutomaticSetup(
            automaticSetupPlan(reviewed.procedure, reviewed.review, context),
            setupFrames,
          ),
        }
      : reviewed;
  if (!v3) return withSetup;
  const revision = executableRevision(withSetup);
  return ApprovedArtifactSchema.parse({
    ...withSetup,
    procedure: ProcedureSpecSchema.parse({
      ...withSetup.procedure,
      approval: { ...withSetup.procedure.approval!, revision },
    }),
    rehearsal: bindRehearsal(claimedRehearsal, revision),
  });
}
