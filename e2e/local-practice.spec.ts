import { test, expect, type Page } from "./safe-test";
import { localFixture } from "../tests/fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import { approveDraft } from "../src/teach/schema";
import { suggestReviews } from "../src/teach/review-suggestions";

async function camera(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      static counter = 0;
      instance = ++Recognition.counter;
      continuous = true;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        Object.assign(window, { localRecognition: this });
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: Recognition });
    window.speechSynthesis.speak = () => {};
    window.speechSynthesis.cancel = () => {};
    const state = { x: 48, hidden: false };
    Object.assign(window, { localScene: state });
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const draw = () => {
      const image = ctx.createImageData(320, 240);
      for (let y = 0; y < 240; y++)
        for (let x = 0; x < 320; x++) {
          const inside =
            !state.hidden &&
            x >= state.x &&
            x < state.x + 64 &&
            y >= 72 &&
            y < 156;
          const sx = inside ? x - state.x : x;
          let hash =
            Math.imul(sx, inside ? 0x45d9f3b : 0x9e3779b1) ^
            Math.imul(y, inside ? 0x119de1f3 : 0x85ebca6b);
          hash ^= hash >>> 16;
          const v = 50 + ((hash >>> 0) % 150);
          image.data.set([v, v, v, 255], (y * 320 + x) * 4);
        }
      ctx.putImageData(image, 0, 0);
      requestAnimationFrame(draw);
    };
    draw();
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
  });
}
async function utter(page: Page, text: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!(window as unknown as { localRecognition?: { onresult?: unknown } })
            .localRecognition?.onresult,
      ),
    )
    .toBe(true);
  await page.evaluate(
    (text) =>
      (
        window as unknown as {
          localRecognition: { onresult: (event: unknown) => void };
        }
      ).localRecognition.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: text } }],
      }),
    text,
  );
}
async function draw(
  page: Page,
  field: string,
  box: { left: number; top: number; right: number; bottom: number },
) {
  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Calibrate this view" }) })
    .getByRole("combobox")
    .selectOption(field);
  const svg = page.getByRole("img", { name: "Drag a box in the lesson frame" });
  await svg.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bounds = await svg.boundingBox();
  if (!bounds) throw Error("Calibration not visible");
  await page.mouse.move(
    bounds.x + box.left * bounds.width,
    bounds.y + box.top * bounds.height,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + box.right * bounds.width,
    bounds.y + box.bottom * bounds.height,
  );
  await page.mouse.up();
  await expect(page.locator("section select option:checked")).toHaveText(/^✓/);
}
function fixture() {
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
test("default Practice uses local worker automatically, corrects reversal and keeps monitoring the goal", async ({
  page,
}) => {
  const { artifact, lesson } = fixture();
  let paid = 0;
  await camera(page);
  await page.route("**/api/teach/**", (route) => {
    if (route.request().url().endsWith("/practice-lesson"))
      return route.fulfill({ json: lesson });
    paid++;
    return route.abort();
  });
  await page.addInitScript(
    (raw) => sessionStorage.setItem("steplint-approved-handoff", raw),
    JSON.stringify(artifact),
  );
  await page.goto("/practice");
  await page.getByLabel("Approved lessons").selectOption(artifact.procedure.id);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: "Capture setup for calibration" })
    .click();
  await draw(page, "workspace", {
    left: 0.66,
    top: 0.08,
    right: 0.86,
    bottom: 0.24,
  });
  await draw(page, "object:component-1", {
    left: 0.15,
    top: 0.3,
    right: 0.35,
    bottom: 0.65,
  });
  await draw(page, "zone:origin", {
    left: 0.1,
    top: 0.25,
    right: 0.4,
    bottom: 0.7,
  });
  await draw(page, "zone:destination", {
    left: 0.6,
    top: 0.25,
    right: 0.9,
    bottom: 0.7,
  });
  await page.getByLabel(/I checked object identities/).check();
  await page.getByRole("button", { name: "Start automatic practice" }).click();
  await expect(
    page
      .locator("#local-practice-status")
      .filter({ hasText: /Automatic tracking active/ }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  for (let x = 50; x <= 208; x += 4) {
    await page.evaluate((x) => {
      (window as unknown as { localScene: { x: number } }).localScene.x = x;
    }, x);
    await page.waitForTimeout(55);
  }
  await expect(
    page.locator("ol").getByText("passed", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(
    page
      .locator("#local-practice-status")
      .filter({ hasText: /Goal verified. Monitoring continues/ }),
  ).toBeVisible();
  for (let x = 204; x >= 160; x -= 4) {
    await page.evaluate((x) => {
      (window as unknown as { localScene: { x: number } }).localScene.x = x;
    }, x);
    await page.waitForTimeout(55);
  }
  await expect(
    page.locator("ol").getByText("failed", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("alert").filter({ hasText: "Stop." }),
  ).toBeVisible();
  for (let x = 164; x <= 208; x += 4) {
    await page.evaluate((x) => {
      (window as unknown as { localScene: { x: number } }).localScene.x = x;
    }, x);
    await page.waitForTimeout(55);
  }
  await expect(
    page.locator("ol").getByText("passed", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Enable voice guidance and controls").check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!(window as unknown as { localRecognition?: unknown })
            .localRecognition,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(window.speechSynthesis, "speaking", {
      configurable: true,
      get: () => true,
    });
    (
      window as unknown as {
        localRecognition: { onresult: (event: unknown) => void };
      }
    ).localRecognition.onresult({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "Guide pause" } }],
    });
  });
  await expect(
    page
      .locator("#local-practice-status")
      .filter({ hasText: "Practice paused. Recalibrate before continuing." }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export diagnostics and recent evidence" })
    .click();
  const file = await (await downloaded).path();
  if (!file) throw Error("Missing diagnostics export");
  const report = JSON.parse(
    await (await import("node:fs/promises")).readFile(file, "utf8"),
  );
  expect(
    report.result.events.some(
      (event: { decision?: string }) => event.decision === "reversal",
    ),
  ).toBe(true);
  expect(
    report.result.events.some(
      (event: { decision?: string }) => event.decision === "restoration",
    ),
  ).toBe(true);
  expect(report.evidence.length).toBeGreaterThan(2);
  expect(report.trackingMeasurements.length).toBe(1);
  expect(paid).toBe(0);
});

test("default Teach reviews the full goal and source moments, then hands the approved export to default Practice", async ({
  page,
}) => {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements = [
    {
      description: "Object at destination",
      status: "covered",
      stepIds: ["transfer"],
      reason: "Synthetic perception supports the position transfer",
    },
  ];
  let approved: ReturnType<typeof approveDraft> | null = null;
  let modelChecks = 0;
  let uploads = 0,
    compiles = 0;
  await camera(page);
  await page.route("**/api/teach/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/access"))
      return route.fulfill({ json: { unlocked: true } });
    if (url.endsWith("/lesson")) {
      uploads++;
      return route.fulfill({
        json: { lesson: context.lesson, token: "mock-upload" },
      });
    }
    if (url.endsWith("/compile")) {
      compiles++;
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            type: "draft",
            draft: local,
            context,
            token: "mock-review",
            uploadDeleted: true,
          }) + "\n",
      });
    }
    if (url.endsWith("/approve")) {
      const input = route.request().postDataJSON();
      approved = approveDraft(input.draft, input.review, context, 1000);
      return route.fulfill({
        json: { ...approved, approvalReceipt: "mock-receipt-browser-only" },
      });
    }
    if (url.endsWith("/practice-lesson") && approved)
      return route.fulfill({
        json: {
          procedure: approved.procedure,
          zoneBindings: approved.zoneBindings,
          sourceLesson: approved.sourceLesson,
          origin: "teach",
        },
      });
    modelChecks++;
    return route.abort();
  });
  await page.goto("/teach");
  await page
    .getByLabel("What visible final result should the learner achieve?")
    .fill("Object at destination");
  await page.getByLabel(/Everyone visible or audible/).check();
  await page
    .getByLabel("Existing lesson MP4")
    .setInputFiles("tests/fixtures/teach-preview.mp4");
  await expect(page.getByLabel("Prepared lesson preview")).toBeVisible();
  await page.getByLabel("Enable voice controls for this stage").check();
  await utter(page, "Guide process recording");
  await expect(
    page.getByRole("status").filter({
      hasText: "Enter the goal and confirm recording processing consent first.",
    }),
  ).toBeVisible();
  expect(uploads).toBe(0);
  await page.getByLabel(/I reviewed this recording/).check();
  await utter(page, "Guide process recording");
  await expect(
    page.getByRole("heading", { name: "3. Create your lesson automatically" }),
  ).toBeVisible();
  expect(uploads).toBe(1);
  const previousRecognizer = await page.evaluate(
    () =>
      (window as unknown as { localRecognition: { instance: number } })
        .localRecognition.instance,
  );
  await page.getByLabel("Enable voice controls for this stage").check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { localRecognition: { instance: number } })
            .localRecognition.instance,
      ),
    )
    .toBeGreaterThan(previousRecognizer);
  await utter(page, "Guide build my guide");
  await expect(
    page.getByRole("status").filter({
      hasText: "Confirm automatic analysis consent first; no analysis started.",
    }),
  ).toBeVisible();
  expect(compiles).toBe(0);
  await page.getByLabel(/I approve automatic lesson analysis/).check();
  await utter(page, "Guide build my guide");
  await expect(
    page.getByRole("heading", { name: "4. Review the draft" }),
  ).toBeVisible();
  await page.getByLabel(/The reviewed steps cover/).check();
  await page.getByLabel("I reviewed this step and its rules.").check();
  await page
    .getByLabel("I checked the marks and can see this zone entry.")
    .check();
  await page
    .getByLabel("Your reviewer name")
    .fill("Synthetic browser reviewer");
  await page
    .getByLabel("I approve this procedure and its visible conditions.")
    .check();
  await page
    .getByRole("button", { name: "Approve procedure", exact: true })
    .click();
  await expect(
    page.getByText(/Procedure approved. Save and open Practice/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save and open Practice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/practice$/);
  await page
    .getByLabel("Approved lessons")
    .selectOption(context.lesson.lessonId);
  await expect(page.getByText("Goal: Object at destination")).toBeVisible();
  expect(modelChecks).toBe(0);
});
