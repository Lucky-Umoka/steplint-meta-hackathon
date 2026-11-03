import { test, expect } from "./safe-test";
import {
  lifecycleHarness,
  lifecycleState,
  utter,
  workers,
} from "./practice-harness";

const running = async (page: import("./safe-test").Page) =>
  expect.poll(() => lifecycleState(page), { timeout: 20_000 }).toBe("running");
const feedback = (page: import("./safe-test").Page) =>
  page.getByTestId("voice-command-feedback");

test("Phase 4: one lifecycle for UI and voice — start with camera off, pause, resume, restart, no duplicate workers (1, 3, 4, 5, 11, 12, 14-19, 23)", async ({
  page,
}) => {
  await lifecycleHarness(page);
  await page.goto("/practice");
  await page.getByLabel("Enable microphone voice controls").check();
  await running(page); // lesson load starts automatically; running only after arming
  // Camera off, then start by voice: exactly one new worker, success only when running.
  await utter(page, "Guide, stop camera");
  await expect.poll(() => lifecycleState(page)).toBe("paused");
  const before = await workers(page);
  await utter(page, "Guide, start practice");
  await utter(page, "Guide, start practice"); // duplicate recognition
  await expect(feedback(page)).toContainText(
    /Duplicate recognition ignored|already in progress/,
  );
  await running(page);
  await expect(feedback(page)).toContainText("Practice is running");
  expect(await workers(page)).toBe(before + 1);
  // Pause by voice, resume by button (same controller).
  await utter(page, "Guide, pause");
  await expect.poll(() => lifecycleState(page)).toBe("paused");
  await expect(feedback(page)).toContainText("Practice paused");
  await page.getByRole("button", { name: "Resume practice" }).click();
  await running(page);
  // Pause by button, resume by voice.
  await page.getByRole("button", { name: "Pause practice" }).click();
  await expect.poll(() => lifecycleState(page)).toBe("paused");
  await utter(page, "Guide, resume practice");
  await running(page);
  await expect(feedback(page)).toContainText("Practice is running");
  // A repeated start while running creates no second worker.
  const steady = await workers(page);
  await page.waitForTimeout(1600);
  await utter(page, "Guide, start practice");
  await expect(feedback(page)).toContainText("already running");
  expect(await workers(page)).toBe(steady);
  // Restart while the camera stays active: confirmation, then one fresh worker.
  await utter(page, "Guide, restart practice");
  await expect(feedback(page)).toContainText("Confirmation required");
  await utter(page, "Guide, confirm restart practice");
  await running(page);
  expect(await workers(page)).toBe(steady + 1);
  // Failed operation is reported as failed, never as success.
  await utter(page, "Guide, stop camera");
  await expect.poll(() => lifecycleState(page)).toBe("paused");
  await page.waitForTimeout(1600);
  await utter(page, "Guide, pause");
  await expect(feedback(page)).toContainText("Practice is not running");
  // Restart after a halt with the camera off.
  await utter(page, "Guide, restart practice");
  await utter(page, "Guide, confirm restart practice");
  await running(page);
  // Diagnostics name the state and the last transition.
  await expect(page.getByTestId("practice-lifecycle")).toContainText(
    "Practice state: running",
  );
});

test("Phase 4: a tracker that stops responding is recovered automatically and never left busy (8)", async ({
  page,
}) => {
  await lifecycleHarness(page);
  await page.goto("/practice");
  await running(page);
  const before = await workers(page);
  await page.evaluate(() => {
    (
      window as unknown as { qaLifecycle: { silent: boolean } }
    ).qaLifecycle.silent = true;
  });
  await expect
    .poll(() => lifecycleState(page), { timeout: 10_000 })
    .not.toBe("running");
  await expect(page.locator("#local-practice-status")).toContainText(
    "The tracker stopped responding",
  );
  await page.evaluate(() => {
    (
      window as unknown as { qaLifecycle: { silent: boolean } }
    ).qaLifecycle.silent = false;
  });
  await running(page);
  expect(await workers(page)).toBeGreaterThan(before);
});

test("Phase 4: camera permission denied is blocked with an understandable reason (6)", async ({
  page,
}) => {
  await lifecycleHarness(page, { denyCamera: true });
  await page.goto("/practice");
  await expect.poll(() => lifecycleState(page)).toBe("blocked");
  await expect(page.locator("#local-practice-status")).toContainText(
    "Camera access was not allowed",
  );
  await expect(page.getByTestId("practice-lifecycle")).toContainText(
    "Camera denied",
  );
});

test("Phase 4: when the starting objects cannot be found, Practice never shows running (7, 9)", async ({
  page,
}) => {
  await lifecycleHarness(page);
  await page.addInitScript(() => {
    (
      window as unknown as { localScene: { hidden: boolean } }
    ).localScene.hidden = true;
  });
  await page.goto("/practice");
  await expect
    .poll(() => lifecycleState(page), { timeout: 10_000 })
    .toMatch(/recovering|acquiring_initial_objects/);
  await page.waitForTimeout(3000);
  expect(await lifecycleState(page)).not.toBe("running");
});

test("Phase 4: Teach stays voice-free (24)", async ({ page }) => {
  await page.addInitScript(() => {
    const qa = { recognitions: 0 };
    Object.assign(window, { qaVoice: qa });
    class Recognition {
      constructor() {
        qa.recognitions++;
      }
      start() {}
      stop() {}
      abort() {}
    }
    Object.assign(window, {
      SpeechRecognition: Recognition,
      webkitSpeechRecognition: Recognition,
    });
  });
  await page.route("**/api/teach/**", (route) =>
    new URL(route.request().url()).pathname.endsWith("/access")
      ? route.fulfill({ json: { unlocked: true } })
      : route.abort("blockedbyclient"),
  );
  await page.goto("/teach");
  await page.getByRole("button", { name: "Create new teach" }).click();
  await expect(page.getByLabel("Enable microphone voice controls")).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { qaVoice: { recognitions: number } }).qaVoice
          .recognitions,
    ),
  ).toBe(0);
});

// Injected Finding replies test the real page retry controller, then actual
// worker tracking must recover. This is not a perception-accuracy assertion.
test("injected Finding setup replies keep retrying after five attempts and real tracking recovers", async ({
  page,
}) => {
  await lifecycleHarness(page, { findingSetup: true });
  await page.goto("/practice");
  await expect.poll(() => workers(page), { timeout: 30000 }).toBeGreaterThan(5);
  await expect.poll(() => lifecycleState(page)).toBe("recovering");
  expect(await lifecycleState(page)).not.toBe("running");
  await page.evaluate(() => {
    (
      window as unknown as { qaLifecycle: { findingSetup: boolean } }
    ).qaLifecycle.findingSetup = false;
  });
  await running(page);
});

test("real-browser voice shapes drive the canonical page: narration prefix, split wake word, filler, bare command, help popup", async ({
  page,
}) => {
  await lifecycleHarness(page);
  await page.goto("/practice");
  await page.getByLabel("Enable microphone voice controls").check();
  await running(page);
  // App narration merged in front of the command in one final result.
  await utter(page, "Missing, unknown, obstructed evidence. Guide, pause");
  await expect.poll(() => lifecycleState(page)).toBe("paused");
  // Chrome finalizes "Guide" separately from the command after a pause.
  await page.waitForTimeout(1600);
  await utter(page, "Guide");
  await utter(page, "resume the practice");
  await running(page);
  // A bare exact command without the wake word (not an echo of the app).
  await page.waitForTimeout(5200);
  await utter(page, "pause");
  await expect.poll(() => lifecycleState(page)).toBe("paused");
  // The manual opens as a popup, generated from the live allowlist.
  await page.getByRole("button", { name: "Voice & gesture commands" }).click();
  const manual = page.getByRole("dialog", { name: "Voice and gesture commands" });
  await expect(manual).toContainText("“Guide, resume practice”");
  await expect(manual).toContainText("Pinch");
  await manual.getByRole("button", { name: "Close" }).click();
  await expect(manual).toBeHidden();
});
