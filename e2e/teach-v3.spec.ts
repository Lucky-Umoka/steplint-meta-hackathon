import { test, expect } from "./safe-test";
import { teachV3Fixture, v3Frames } from "../tests/fixtures/teach-v3";
import { localExecutionDraft } from "../src/teach/local-execution";

test("canonical Teach preserves complete V3 scope and blocks approval while required work is unsupported", async ({
  page,
}) => {
  const { draft, context, execution } = teachV3Fixture(true);
  execution.requirements.push({
    id: "required-force",
    description: "Required force cannot be measured",
    status: "unsupported",
    capability: "unsupported",
    stepIds: [],
    goalPredicateIds: [],
    reason: "No force evidence exists in camera geometry",
  });
  const normalized = localExecutionDraft(draft, execution.goal, context);
  normalized.videoReview = {
    actions: normalized.procedure.steps.map((step, index) => ({
      id: `action-${index}`,
      description: step.description,
      objectIds: [step.condition.componentId],
      requirementIds: ["requirement-1"],
      stepIds: [step.id],
      evidenceWindow: step.execution!.evidenceWindow,
      visualSupport: "visible",
      coverage: "represented",
      reason: "Mock visual source action",
    })),
    goal: {
      description: execution.goal,
      requirementIds: ["requirement-1", "required-force"],
      evidenceFrames: [v3Frames(true).last],
      limitations: ["Mocked browser evidence only"],
    },
  };
  normalized.videoReview.actions.push({
    id: "unshown-force",
    description: "Required unobservable force",
    objectIds: [],
    requirementIds: ["required-force"],
    stepIds: [],
    evidenceWindow: null,
    visualSupport: "not_shown",
    coverage: "unsupported",
    reason: "No force sensor or visible source evidence",
  });
  const requests: string[] = [];
  await page.route("**/api/teach/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path.endsWith("/access"))
      return route.fulfill({ json: { unlocked: true } });
    if (path.endsWith("/lesson"))
      return route.fulfill({
        json: { lesson: context.lesson, token: "mock-upload" },
      });
    if (path.endsWith("/compile")) {
      const input = route.request().postDataJSON();
      expect(input.videoBase64).toMatch(/^data:video\/mp4;base64,/);
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            type: "draft",
            draft: normalized,
            context,
            token: "mock-review",
            uploadDeleted: true,
          }) + "\n",
      });
    }
    return route.abort("blockedbyclient");
  });
  await page.goto("/teach");
  await page.getByRole("button", { name: "Create new teach" }).click();
  await page.getByLabel(/Everyone visible or audible/).check();
  await page
    .getByLabel("Existing lesson MP4")
    .setInputFiles("tests/fixtures/teach-preview.mp4");
  await expect(page.getByLabel("Prepared lesson preview")).toBeVisible();
  await page.getByLabel(/I reviewed this recording/).check();
  await page
    .getByRole("button", { name: "Build my lesson", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "4. Review the draft" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Required force cannot be measured", { exact: false })
      .first(),
  ).toBeVisible();
  await page.getByText("Advanced rule editor", { exact: true }).click();
  const saved = JSON.parse(await page.getByLabel("Draft JSON").inputValue());
  expect(saved.procedure.steps).toHaveLength(2);
  expect(saved.procedure.execution).toEqual(execution);
  expect(saved.videoReview).toEqual(normalized.videoReview);
  expect(saved.procedure.steps[0].execution.evidenceWindow).toEqual(
    v3Frames(true).first,
  );
  expect(saved.procedure.steps[1].execution.evidenceWindow).toEqual(
    v3Frames(true).second,
  );
  await page.getByLabel("Your reviewer name").fill("Mock browser reviewer");
  await page.getByLabel("I approve this lesson for Practice.").check();
  await expect(
    page.getByRole("button", { name: "Approve procedure", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Unsupported required work: Required force cannot be measured/).first(),
  ).toBeVisible();
  expect(requests.filter((path) => path.endsWith("/compile"))).toHaveLength(1);
  expect(requests.some((path) => path.endsWith("/approve"))).toBe(false);
});
