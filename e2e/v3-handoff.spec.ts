import { test, expect, type Page } from "./safe-test";
import { v3JourneyFixture, reviewerCorrections } from "./v3-journey-fixture";
import { approveDraft } from "../src/teach/schema";
import { finalizeApprovedLesson } from "../src/teach/finalize-approval";
import { loadApprovedLesson } from "../src/practice/load-approved-lesson";

/**
 * Phase 2 browser journey (mocked models, real browser storage and real
 * approval/handoff code). Proves the data contract, not camera execution.
 */
async function storedRaw(page: Page, id: string): Promise<string> {
  return page.evaluate(async (lessonId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("steplint-approved-procedures", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const row = await new Promise<{ raw: string }>((resolve, reject) => {
      const r = db.transaction("procedures").objectStore("procedures").get(lessonId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return row.raw;
  }, id);
}
async function overwriteStored(page: Page, raw: string) {
  await page.evaluate(async (text) => {
    const item = JSON.parse(text);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("steplint-approved-procedures", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("procedures", "readwrite");
      tx.objectStore("procedures").put({ id: item.procedure.id, title: item.procedure.title, raw: text, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, raw);
}

test("Phase 2: a corrected V3 lesson survives approve → save → reload → Practice selection unchanged", async ({ page }) => {
  const { context, draft } = v3JourneyFixture();
  const corrected = reviewerCorrections(draft);
  let approvedResponse: unknown = null;
  let approvedDraftInput: unknown = null;
  const paid: string[] = [];
  await page.route("**/api/teach/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/access")) return route.fulfill({ json: { unlocked: true } });
    if (path.endsWith("/lesson")) return route.fulfill({ json: { lesson: context.lesson, token: "mock-upload" } });
    if (path.endsWith("/compile"))
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: JSON.stringify({ type: "draft", draft, context, token: "mock-review", uploadDeleted: true }) + "\n",
      });
    if (path.endsWith("/approve")) {
      // Same functions the real handler runs after session/image checks.
      const input = route.request().postDataJSON();
      approvedDraftInput = input.draft;
      const reviewed = approveDraft(input.draft, input.review, context, 1000);
      approvedResponse = finalizeApprovedLesson(reviewed, context, input.setupFrames, input.rehearsal);
      return route.fulfill({ json: approvedResponse });
    }
    paid.push(path);
    return route.abort("blockedbyclient");
  });

  // 1. Create a V3 lesson.
  await page.goto("/teach");
  await page.getByRole("button", { name: "Create new teach" }).click();
  await page.getByLabel(/Everyone visible or audible/).check();
  await page.getByLabel("Existing lesson MP4").setInputFiles("tests/fixtures/teach-preview.mp4");
  await expect(page.getByLabel("Prepared lesson preview")).toBeVisible();
  await page.getByLabel(/I reviewed this recording/).check();
  await page.getByRole("button", { name: "Build my lesson", exact: true }).click();
  await expect(page.getByRole("heading", { name: "4. Review the draft" })).toBeVisible();

  // 2. Review and correct roles, a step and the final goal (existing editor).
  await page.getByText("Advanced rule editor", { exact: true }).click();
  await page.getByLabel("Draft JSON").fill(JSON.stringify(corrected, null, 2));
  await page.getByRole("button", { name: "Apply edited draft" }).click();
  await expect(page.getByText(`Goal: ${corrected.procedure.execution!.goal}`)).toBeVisible();
  await expect(page.getByText("Needs attention before approval")).toHaveCount(0);

  // 3. Approve.
  await page.getByLabel("Your reviewer name").fill("Phase 2 reviewer");
  await page.getByLabel("I approve this lesson for Practice.").check();
  await page.getByRole("button", { name: "Approve procedure", exact: true }).click();
  await expect(page.getByText(/Procedure approved. Save and open Practice/)).toBeVisible();
  await expect(page.getByText("Rehearsal: not run for this exact revision.")).toBeVisible();
  expect(approvedDraftInput).toEqual(JSON.parse(JSON.stringify(corrected)));

  // 4. Save.
  await page.getByRole("button", { name: "Save and open Practice", exact: true }).click();
  const id = context.lesson.lessonId;
  await expect(page).toHaveURL(new RegExp(`lesson=${id}`));
  const savedRaw = await storedRaw(page, id);
  expect(JSON.parse(savedRaw)).toEqual(JSON.parse(JSON.stringify(approvedResponse)));

  // 5. Reload the application.
  await page.reload();
  // 6. Select the saved lesson in Practice.
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Choose a lesson" })).toBeVisible();
  await page
    .getByRole("article")
    .filter({ hasText: corrected.procedure.title })
    .getByRole("link", { name: "Practice", exact: true })
    .click();
  await expect(page.getByTestId("practice-camera")).toBeVisible();
  await expect(page.getByText(`Goal: ${corrected.procedure.execution!.goal}`).first()).toBeVisible();

  // 7. Every field unchanged after reload + selection.
  const reloadedRaw = await storedRaw(page, id);
  expect(reloadedRaw).toBe(savedRaw);
  const lesson = loadApprovedLesson(reloadedRaw);
  const approved = JSON.parse(savedRaw);
  expect(lesson.procedure).toEqual(approved.procedure);
  expect(lesson.zoneBindings).toEqual(approved.zoneBindings);
  expect(lesson.automaticSetup).toEqual(approved.automaticSetup);
  expect(lesson.procedure.components[1].execution).toEqual(corrected.procedure.components[1].execution);
  expect(lesson.procedure.steps[0].description).toBe("Slide the object to the middle mark");
  expect(lesson.procedure.execution).toEqual(corrected.procedure.execution);
  expect(lesson.procedure.steps.map((s) => s.execution)).toEqual(corrected.procedure.steps.map((s) => s.execution));
  expect(lesson.procedure.approval?.revision).toMatch(/^[0-9a-f]{64}$/);
  expect(approved.rehearsal).toEqual({ status: "not_run" });

  // Missing automatic setup prevents loading; an executable edit makes the approval stale.
  const noSetup = { ...approved };
  delete noSetup.automaticSetup;
  await overwriteStored(page, JSON.stringify(noSetup));
  await page.goto(`/practice?lesson=${id}`);
  const alert = page.getByRole("alert").filter({ hasText: /\S/ });
  await expect(alert).toContainText("This saved lesson cannot be used: Automatic setup is missing");
  await expect(alert).not.toContainText('"code"');
  await expect(page.getByTestId("practice-camera")).toHaveCount(0);
  const edited = structuredClone(approved);
  edited.procedure.steps[0].description = "Edited after approval";
  await overwriteStored(page, JSON.stringify(edited));
  await page.goto(`/practice?lesson=${id}`);
  await expect(alert).toContainText("This approval is stale");
  await expect(page.getByTestId("practice-camera")).toHaveCount(0);
  expect(paid).toEqual([]);
});
