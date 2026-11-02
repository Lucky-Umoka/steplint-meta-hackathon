import { localFixture } from "../tests/fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import { approveDraft } from "../src/teach/schema";
import { suggestReviews } from "../src/teach/review-suggestions";

export function approvedFixture() {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements[0] = {
    description: "Visible transfer",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Synthetic human review",
  };
  const checks = suggestReviews(local, context);
  const artifact = {
    ...approveDraft(
      local,
      {
        reviewer: "Browser test",
        confirmed: true,
        goalConfirmed: true,
        steps: [
          {
            stepId: "transfer",
            ...checks.transfer,
            reviewed: true,
            conditionConfirmed: true,
          },
        ],
      },
      context,
      1000,
    ),
    approvalReceipt: "mock-only-not-a-real-receipt",
  };
  return {
    artifact,
    lesson: {
      procedure: artifact.procedure,
      zoneBindings: artifact.zoneBindings,
      sourceLesson: artifact.sourceLesson,
      origin: "teach",
    },
  };
}
