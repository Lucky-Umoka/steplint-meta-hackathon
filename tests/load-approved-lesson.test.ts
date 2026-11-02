import { expect, it } from "vitest";
import { localFixture } from "./fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import { suggestReviews } from "../src/teach/review-suggestions";
import { approveDraft } from "../src/teach/schema";
import { loadApprovedLesson } from "../src/practice/load-approved-lesson";
function artifact() {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements[0] = {
    description: "Visible transfer",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Human review fixture",
  };
  const checks = suggestReviews(local, context);
  return approveDraft(
    local,
    {
      reviewer: "Test reviewer",
      confirmed: true,
      goalConfirmed: true,
      steps: [
        {
          ...checks.transfer,
          stepId: "transfer",
          reviewed: true,
          conditionConfirmed: true,
        },
      ],
    },
    context,
    1000,
  );
}
it("loads an approved lesson without a creator token or receipt", () => {
  const approved = artifact();
  expect(loadApprovedLesson(JSON.stringify(approved)).procedure.id).toBe(
    approved.procedure.id,
  );
  expect(
    loadApprovedLesson(
      JSON.stringify({ ...approved, approvalReceipt: "expired-old-session" }),
    ).origin,
  ).toBe("teach");
});
it("still rejects unapproved, mismatched, malformed and oversized lessons", () => {
  const approved = artifact();
  expect(() =>
    loadApprovedLesson(
      JSON.stringify({
        ...approved,
        procedure: { ...approved.procedure, approval: null },
      }),
    ),
  ).toThrow();
  expect(() =>
    loadApprovedLesson(
      JSON.stringify({
        ...approved,
        sourceLesson: {
          ...approved.sourceLesson,
          lessonId: "00000000-0000-4000-8000-000000000099",
        },
      }),
    ),
  ).toThrow();
  expect(() => loadApprovedLesson("{}")).toThrow();
  expect(() => loadApprovedLesson(" ".repeat(1_500_001))).toThrow(
    "storage limit",
  );
});
