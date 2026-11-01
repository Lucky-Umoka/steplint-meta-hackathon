import { test, expect } from "./safe-test";
import { localFixture } from "../tests/fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";

test("rehearsal opens an unsaved Practice run from Teach review", async ({
  page,
  context,
}) => {
  const { context: teachContext, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements = [
    {
      description: "Object at destination",
      status: "covered",
      stepIds: ["transfer"],
      reason: "Synthetic perception supports the position transfer",
    },
  ];
  await page.route("**/api/teach/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/access"))
      return route.fulfill({ json: { unlocked: true } });
    if (url.endsWith("/lesson"))
      return route.fulfill({
        json: { lesson: teachContext.lesson, token: "mock-upload" },
      });
    if (url.endsWith("/compile"))
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            type: "draft",
            draft: local,
            context: teachContext,
            token: "mock-review",
            uploadDeleted: true,
          }) + "\n",
      });
    return route.abort();
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
  ).toBeVisible({ timeout: 30000 });
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Test in Practice" }).click(),
  ]);
  await expect(
    popup.getByText("Rehearsal — testing an unapproved draft."),
  ).toBeVisible({ timeout: 20000 });
  await expect(popup.getByText("Goal: Object at destination")).toBeVisible();
  await popup.getByText("Steps · last observed result").click();
  await expect(
    popup.locator("ol").getByText("Transfer the object to its destination"),
  ).toBeVisible();
  await popup.close();
});
