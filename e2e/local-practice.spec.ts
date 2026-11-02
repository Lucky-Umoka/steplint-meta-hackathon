import { approvedFixture as fixture } from "./approved-fixture";
import { test, expect, type Page } from "./safe-test";
import { installHandFixture, pinchControl } from "./hand-fixture";
import { localFixture } from "../tests/fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import {
  automaticSetupPlan,
  bindAutomaticSetup,
} from "../src/teach/automatic-setup";
import { approveDraft } from "../src/teach/schema";

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
    const spoken: string[] = [];
    Object.assign(window, { localSpoken: spoken });
    window.speechSynthesis.speak = (utterance) => {
      spoken.push(utterance.text);
    };
    window.speechSynthesis.cancel = () => {};
    const state = { x: 48, hidden: false };
    Object.assign(window, { localScene: state });
    const canvas = document.createElement("canvas"),
      background = document.createElement("canvas"),
      sprite = document.createElement("canvas");
    canvas.width = background.width = 320;
    canvas.height = background.height = 240;
    sprite.width = 64;
    sprite.height = 84;
    const ctx = canvas.getContext("2d")!,
      bg = background.getContext("2d")!,
      object = sprite.getContext("2d")!;
    const pixels = bg.createImageData(320, 240),
      objectPixels = object.createImageData(64, 84);
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 320; x++) {
        let hash = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
        hash ^= hash >>> 16;
        const value = 50 + ((hash >>> 0) % 150),
          i = (y * 320 + x) * 4;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
      }
    for (let y = 0; y < 84; y++)
      for (let x = 0; x < 64; x++) {
        let hash = Math.imul(x, 0x45d9f3b) ^ Math.imul(y + 72, 0x119de1f3);
        hash ^= hash >>> 16;
        const value = 50 + ((hash >>> 0) % 150),
          i = (y * 64 + x) * 4;
        objectPixels.data[i] =
          objectPixels.data[i + 1] =
          objectPixels.data[i + 2] =
            value;
        objectPixels.data[i + 3] = 255;
      }
    bg.putImageData(pixels, 0, 0);
    object.putImageData(objectPixels, 0, 0);
    // The camera supplies pixels; avoid a synthetic 76,800-array allocation
    // loop per animation frame competing with the actual verification UI.
    const draw = () => {
      ctx.drawImage(background, 0, 0);
      if (!state.hidden) ctx.drawImage(sprite, state.x, 72);
      requestAnimationFrame(draw);
    };
    draw();
    Object.assign(window, {
      localReferenceImage: canvas.toDataURL("image/jpeg", 0.85),
    });
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
  await expect(
    page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: "Calibrate this view" }),
      })
      .locator("select option:checked"),
  ).toHaveText(/^✓/);
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
  await page.getByLabel("Enable microphone voice controls").check();
  await utter(page, "Muse, start camera");
  await expect(
    page.getByRole("button", { name: "Capture setup for calibration" }),
  ).toBeEnabled();
  await utter(page, "Muse, capture setup");
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
  await utter(page, "Muse, start practice");
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
  await page.getByLabel("Enable microphone voice controls").check();
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
      .filter({ hasText: "Practice paused." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume with fresh calibration" })
    .click();
  await draw(page, "workspace", {
    left: 0.66,
    top: 0.08,
    right: 0.86,
    bottom: 0.24,
  });
  await draw(page, "object:component-1", {
    left: 0.65,
    top: 0.3,
    right: 0.85,
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
  await page
    .getByRole("button", { name: "Resume automatic practice", exact: true })
    .click();
  await expect(
    page
      .locator("#local-practice-status")
      .filter({ hasText: /Goal verified. Monitoring continues/ }),
  ).toBeVisible();
  await expect(
    page.locator("ol").getByText("passed", { exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByText("Control settings", { exact: true }).click();
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
  expect(report.calibrations).toHaveLength(2);
  console.log("local browser latency", report.latencySummary);
  await (
    await import("node:fs/promises")
  ).writeFile(
    ".media-lab/local-browser-latency.json",
    JSON.stringify(report.latencySummary, null, 2),
  );
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
  let automaticSetup: ReturnType<typeof bindAutomaticSetup> | undefined;
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
      automaticSetup = bindAutomaticSetup(
        automaticSetupPlan(approved.procedure, approved.review, context),
        input.setupFrames,
      );
      return route.fulfill({
        json: {
          ...approved,
          automaticSetup,
          approvalReceipt: "mock-receipt-browser-only",
        },
      });
    }
    if (url.endsWith("/practice-lesson") && approved)
      return route.fulfill({
        json: {
          procedure: approved.procedure,
          zoneBindings: approved.zoneBindings,
          sourceLesson: approved.sourceLesson,
          automaticSetup,
          origin: "teach",
        },
      });
    modelChecks++;
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
  ).toBeVisible();
  expect(uploads).toBe(1);
  expect(compiles).toBe(1);
  await page
    .getByLabel("Your reviewer name")
    .fill("Synthetic browser reviewer");
  await page.getByLabel("I approve this lesson for Practice.").check();
  await page
    .getByRole("button", { name: "Approve procedure", exact: true })
    .click();
  await expect(
    page.getByText(/Procedure approved. Save and open Practice/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save and open Practice", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`lesson=${context.lesson.lessonId}`));
  await expect(page.getByText("Goal: Object at destination")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Demonstrated starting state", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Demonstrated final goal", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Demonstrated final goal", exact: true }),
  ).toBeVisible();
  expect(modelChecks).toBe(0);
});

test("default Practice gestures activate voice settings and camera buttons; desktop and mobile layout preserve camera/companion hierarchy", async ({
  page,
}) => {
  await camera(page);
  await installHandFixture(page);
  const { artifact, lesson } = fixture();
  await page.route("**/api/teach/practice-lesson", (route) =>
    route.fulfill({ json: lesson }),
  );
  await page.addInitScript(
    (raw) => sessionStorage.setItem("steplint-approved-handoff", raw),
    JSON.stringify(artifact),
  );
  await page.goto("/practice");
  const cameraPanel = page.getByTestId("practice-camera"),
    companion = page.getByTestId("practice-companion");
  const left = await cameraPanel.boundingBox(),
    right = await companion.boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  await expect(companion.locator("section")).toHaveClass(/bg-slate-950/);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.getByLabel("Enable gesture control", { exact: true }).check();
  await expect(
    page.getByText(
      "Gesture control on — point in the right-edge zone, pinch to click",
      { exact: true },
    ),
  ).toBeVisible();
  const voice = page.getByLabel("Enable microphone voice controls");
  await expect(voice).toBeChecked();
  await pinchControl(page, voice);
  await expect(voice).not.toBeChecked();
  await voice.check();
  await expect(voice).toBeChecked();
  await pinchControl(
    page,
    page.getByRole("button", { name: "Stop camera", exact: true }),
  );
  await expect(
    page.getByRole("button", { name: "Start camera", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Steps", exact: true }),
  ).toContainText("pending");
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCamera = await cameraPanel.boundingBox(),
    mobileCompanion = await companion.boundingBox();
  expect(mobileCompanion!.y).toBeGreaterThan(
    mobileCamera!.y + mobileCamera!.height,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: ".media-lab/restored-practice-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 832 });
  await page.screenshot({
    path: ".media-lab/restored-practice-desktop.png",
    fullPage: true,
  });
  // Optional manual calibration intentionally hides the live panels. Exercise
  // gesture clicks while the camera/gesture panel is visible, then check voice
  // capture separately without pretending a hidden pointer is an active UI.
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Capture setup for calibration",
      exact: true,
    }),
  ).toBeEnabled();
  await utter(page, "Muse, capture setup");
  await expect(
    page.getByRole("heading", { name: "Calibrate this view" }),
  ).toBeVisible();
});

test("automatic Practice starts from reviewed Teach references without calibration buttons and produces green, red and spoken correction", async ({
  page,
}) => {
  await camera(page);
  const { artifact } = fixture();
  await page.addInitScript((raw) => {
    const image = (window as unknown as { localReferenceImage: string })
      .localReferenceImage;
    const approved = JSON.parse(raw);
    approved.automaticSetup = {
      sceneFrame: 0,
      objects: [
        {
          id: "component-1",
          frame: 0,
          box: { left: 0.15, top: 0.3, right: 0.35, bottom: 0.65 },
          fixed: false,
        },
      ],
      frames: [{ frame: 0, image }],
    };
    sessionStorage.setItem(
      "steplint-approved-handoff",
      JSON.stringify(approved),
    );
  }, JSON.stringify(artifact));
  await page.goto("/practice");
  await expect(page.locator("#local-practice-status")).toContainText(
    "Automatic tracking active",
    { timeout: 20000 },
  );
  await expect(
    page.getByRole("heading", { name: "Calibrate this view" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start automatic practice" }),
  ).toHaveCount(0);
  await page.waitForTimeout(600);
  for (let x = 50; x <= 208; x += 4) {
    await page.evaluate((x) => {
      (window as unknown as { localScene: { x: number } }).localScene.x = x;
    }, x);
    await page.waitForTimeout(55);
  }
  await expect(
    page.getByRole("region", { name: "Steps", exact: true }),
  ).toContainText("passed");
  await expect(page.getByTestId("practice-camera")).toHaveClass(
    /border-green-600/,
  );
  await expect(page.getByTestId("practice-glow")).toHaveClass(
    /practice-glow-pass/,
  );
  await expect(
    page.getByLabel("Live object tracking").locator("rect"),
  ).toHaveAttribute("stroke", "#16a34a");
  for (let x = 204; x >= 160; x -= 4) {
    await page.evaluate((x) => {
      (window as unknown as { localScene: { x: number } }).localScene.x = x;
    }, x);
    await page.waitForTimeout(55);
  }
  await expect(
    page.getByRole("region", { name: "Steps", exact: true }),
  ).toContainText("failed");
  await expect(page.getByTestId("practice-camera")).toHaveClass(
    /border-red-600/,
  );
  await expect(page.getByTestId("practice-glow")).toHaveClass(
    /practice-glow-fail/,
  );
  await expect(
    page.getByLabel("Live object tracking").locator("rect"),
  ).toHaveAttribute("stroke", "#dc2626");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { localSpoken: string[] }).localSpoken.some(
          (text) => text.startsWith("Stop."),
        ),
      ),
    )
    .toBe(true);
  await page.getByLabel("Enable microphone voice controls").check();
  await utter(page, "StepLint, pause practice");
  await expect(
    page.getByRole("button", { name: "Pause practice", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Resume practice", exact: true }),
  ).toBeVisible();
  await utter(page, "Guide, resume practice");
  await expect(
    page.getByRole("button", { name: "Pause practice", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  for (let x = 164; x <= 208; x += 4) {
    await page.evaluate((x) => {
      (window as unknown as { localScene: { x: number } }).localScene.x = x;
    }, x);
    await page.waitForTimeout(55);
  }
  await expect(
    page.getByRole("region", { name: "Steps", exact: true }),
  ).toContainText("passed");
  await expect(
    page.getByRole("heading", { name: "Calibrate this view" }),
  ).toHaveCount(0);
  const spokenAuto = await page.evaluate(
    () => (window as unknown as { localSpoken: string[] }).localSpoken,
  );
  expect(
    spokenAuto.some((text) => text.startsWith("Practice started")),
    "automatic starts and retries must stay silent",
  ).toBe(false);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".media-lab/restored-practice-correction.png",
    fullPage: true,
  });
});

test("Teach library opens the selected approved lesson without a learner token or a second selection", async ({
  page,
}) => {
  const { artifact } = fixture();
  const { approvalReceipt: _receipt, ...portable } = artifact;
  void _receipt;
  await camera(page);
  let teachRequests = 0;
  await page.route("**/api/teach/**", (route) => {
    teachRequests++;
    return route.fulfill({
      status: 401,
      json: { error: "No creator session" },
    });
  });
  await page.goto("/practice");
  await page.evaluate(async (raw) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("steplint-approved-procedures", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("procedures", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const item = JSON.parse(raw);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("procedures", "readwrite");
      tx.objectStore("procedures").put({
        id: item.procedure.id,
        title: item.procedure.title,
        raw,
        savedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, JSON.stringify(portable));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose a lesson" }),
  ).toBeVisible();
  await expect(page.getByTestId("practice-camera")).toHaveCount(0);
  await expect(page.getByTestId("practice-companion")).toHaveCount(0);
  await expect(page.getByLabel("Enable microphone voice controls")).toHaveCount(
    0,
  );
  for (const [name, width, height] of [
    ["desktop", 1280, 832],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `.media-lab/entry-flow/after-${name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 832 });
  await page
    .getByRole("article")
    .filter({ hasText: artifact.procedure.title })
    .getByRole("link", { name: "Practice", exact: true })
    .click();
  await expect(page.getByTestId("practice-camera")).toBeVisible();
  await expect(page.getByLabel("Approved lessons")).toHaveCount(0);
  await expect(page.getByText("Goal: Object at destination")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a lesson" }),
  ).toBeVisible();
  await expect(page.getByTestId("practice-camera")).toHaveCount(0);
  expect(teachRequests).toBe(0);
  // Creator library access is separate; learner navigation below has no token.
  await page.route("**/api/teach/access", (route) =>
    route.fulfill({ json: { unlocked: true } }),
  );
  await page.goto("/teach");
  await page
    .getByRole("article")
    .filter({ hasText: artifact.procedure.title })
    .getByRole("button", { name: "Practice", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`lesson=${artifact.procedure.id}`));
  await expect(page.getByText("Goal: Object at destination")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Goal: Object at destination")).toBeVisible();
  await page.goto("/practice?lesson=missing-lesson");
  await expect(
    page.getByRole("alert").filter({ hasText: "not saved in this browser" }),
  ).toBeVisible();
  await expect(page.getByTestId("practice-camera")).toHaveCount(0);
  expect(teachRequests).toBe(0);
});
